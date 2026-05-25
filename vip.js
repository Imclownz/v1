/**
 * ==============================================================================
 * PROJECT: OMNI-MATRIX V2.4 (NATIVE ENGINE ARCHITECTURE)
 * Pipeline: Sanitizer -> M1(Gun) -> M4(Eyes) -> M7(Camera) -> TriggerCheck -> M5(Stance) -> Cores -> M8(Magic)
 * Objective: Zero-Ping Synchronization, Absolute Memory Leak Prevention, Dynamic Escaping
 * ==============================================================================
 */

// Định tuyến môi trường an toàn (Native App JSBridge hoặc WebView)
const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);

// ============================================================================
// 0. GLOBAL STATE (ZERO-PING SHARED MEMORY)
// ============================================================================
if (!_global.__OmniState || _global.__OmniState.version !== "MATRIX_V2.4") {
    _global.__OmniState = {
        version: "MATRIX_V2.4",
        weaponProfile: { Core: "IGNORE", RequireZeroVelocity: false },
        
        target: { id: null, pos: null, predicted_pos: null, distance: 999.0 },
        self: { pos: {x:0, y:0, z:0}, anchorPos: {x:0, y:0, z:0}, vel: {x:0, y:0, z:0}, isPerfectlyStill: false, anchoredFireOrigin: null },
        
        weapon: { isFiring: false, id: "", category: "", triggerFired: false }, 
        tracker: {}, // Sẽ được cấu trúc lại ở M4 để chứa state Flushing
        
        camera: {
            lastTime: Date.now(),
            integralYaw: 0.0,
            integralPitch: 0.0,
            prevErrorYaw: 0.0,
            prevErrorPitch: 0.0,
            lastPitch: 0,
            
            // -- Biến trạng thái cho Pitch Escape (Thoát bụng) --
            escapeFrames: 0,      
            isTrapped: false,     
            justEscaped: false,
            
            // -- Tham số Hot-Tuning (Sẽ được Shortcut 2 điều khiển) --
            escapeK: 0.45,  // Lực búng cơ bản
            escapeT: 4      // Số frame duy trì lực
        }
    };
}

// ============================================================================
// MODULE 1: WEAPON CLASSIFIER V2.4
// Nhiệm vụ: Phân loại luồng xử lý vật lý dựa trên vũ khí đang cầm.
// Tối ưu: Chuẩn hóa hàm thành execute(), cache dữ liệu để chống tính toán thừa.
// ============================================================================
class WeaponClassifier {
    
    static classify(weaponData) {
        let profile = { Core: "IGNORE", RequireZeroVelocity: false };
        if (!weaponData) return profile;

        const id = (weaponData.id || "").toString().toUpperCase();
        const name = (weaponData.name || "").toString().toUpperCase();
        const category = (weaponData.category || "").toString().toUpperCase();
        const identifier = `${id}_${name}_${category}`;

        if (identifier.includes("SHOTGUN") || identifier.includes("M1887") || 
            identifier.includes("M1014") || identifier.includes("SPAS") || 
            identifier.includes("MAG-7") || identifier.includes("TROGON") || identifier.includes("CHARGE")) {
            profile.Core = "SHOTGUN";
        } 
        else if (identifier.includes("SNIPER") || identifier.includes("PISTOL") || 
                 identifier.includes("DESERT_EAGLE") || identifier.includes("WOODPECKER") || 
                 identifier.includes("SVD") || identifier.includes("AC80") || 
                 identifier.includes("AWM") || identifier.includes("M82B") || identifier.includes("KAR98")) {
            profile.Core = "ONETAP";
        } 
        else if (identifier.includes("SMG") || identifier.includes("AR") || 
                 identifier.includes("MACHINE") || identifier.includes("LMG") || 
                 identifier.includes("MP40") || identifier.includes("UMP") || 
                 identifier.includes("AK") || identifier.includes("SCAR") || 
                 identifier.includes("GROZA") || identifier.includes("FAMAS")) {
            profile.Core = "AUTO";
        }

        return profile;
    }

    // Đổi tên thành execute() để đồng bộ toàn bộ chuỗi Pipeline
    static execute(payload) {
        const weaponState = _global.__OmniState.weapon;

        // Cập nhật cờ bắn (Is Firing) ở mức ưu tiên cao nhất
        if (payload.is_firing !== undefined) {
            weaponState.isFiring = payload.is_firing;
        }

        if (payload.weapon) {
            if (payload.weapon.is_firing !== undefined) {
                weaponState.isFiring = payload.weapon.is_firing;
            }
            
            // Logic Caching: Chỉ tốn CPU để phân loại lại nếu ID vũ khí thực sự thay đổi
            if (payload.weapon.id !== undefined && payload.weapon.id !== weaponState.id) {
                weaponState.id = payload.weapon.id;
                weaponState.category = payload.weapon.category || "";
                _global.__OmniState.weaponProfile = this.classify(payload.weapon);
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 4: TARGET KINEMATICS V7.5 – ZERO-JITTER STAGED TRACKING
// Nhiệm vụ: Tracking mục tiêu, dự đoán quỹ đạo, triệt tiêu quán tính rác, 
//           kẹp DeltaTime để chống lag-spike, và ưu tiên xương (Bone Priority).
// ============================================================================
class TargetKinematics {
    
    // Hash tuyệt đối của xương đầu (Head Bone) từ file 2.json
    static HEAD_BONE_HASH = -2111735698;

    static normalizeAngle(angle) {
        while (angle > 180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }

    // [UPGRADE 1]: CƠ CHẾ XẢ RÁC (FLUSH STATE) CHỐNG TÍCH LŨY MA QUỶ
    static flushTrackerState(targetId) {
        _global.__OmniState.tracker[targetId] = { 
            history: [], 
            velocity: {x:0, y:0, z:0},
            lastVelocity: {x:0, y:0, z:0},
            lastAccel: {x:0, y:0, z:0},
            lastJerk: {x:0, y:0, z:0}
        };
    }

    static execute(payload) {
        const selfState = _global.__OmniState.self;
        const weaponState = _global.__OmniState.weapon;
        const camState = _global.__OmniState.camera || {};
        
        // 1. CẬP NHẬT TỌA ĐỘ BẢN THÂN (SELF STATE)
        if (payload.anchorPos !== undefined) {
            selfState.anchorPos = { ...payload.anchorPos };
        } else if (payload.pos !== undefined && selfState.anchorPos.x === 0) {
            selfState.anchorPos = { ...payload.pos };
        }
        if (payload.velocity !== undefined) {
            selfState.vel = { ...payload.velocity };
        }

        // Tắt Aim-Assist rác mặc định của Game Engine
        if (payload.aim_assist !== undefined) {
            payload.aim_assist.friction = 0.0;
            payload.aim_assist.adhesion = 0.0;
            payload.aim_assist.snap_weight = -99999.0;
        }

        if (!payload || !payload.players || !Array.isArray(payload.players)) return payload;
        if (!selfState.anchorPos || selfState.anchorPos.x === 0) return payload;

        const isFiring = weaponState.isFiring || weaponState.triggerFired || payload.is_firing || false;
        const currentTime = Date.now();
        if (!isFiring) {
            if (!camState.lastKineTime) camState.lastKineTime = 0;
            if (currentTime - camState.lastKineTime < 15) {
                return payload; // Bỏ qua nhịp này, giữ nguyên tọa độ cũ để tiết kiệm CPU
            }
            camState.lastKineTime = currentTime;
        }
        
        // Cửa sổ thời gian 0.2s (200ms)
        const fireElapsed = isFiring && camState.fireStartTime 
            ? (currentTime - camState.fireStartTime) 
            : 99999;

        let bestTarget = null;
        let lowestThreatScore = 99999.0;
        const currentYaw = payload.aim_yaw !== undefined ? payload.aim_yaw : (camState.prevYaw || 0.0);
        if (payload.aim_yaw !== undefined) camState.prevYaw = payload.aim_yaw;

        // ====================================================================
        // 2. STAGED NECK-TO-HEAD MAGNETIC INVERSION (ANTI-TORSO TRAP)
        // ====================================================================
        for (let i = 0; i < payload.players.length; i++) {
            const enemy = payload.players[i];

            if (enemy.hitboxes) {
                if (isFiring) {
                    if (fireElapsed <= 80) {
                        // STAGE 1 (0-80ms): Snap ưu tiên Cổ (Neck) để ổn định khung hình
                        if (enemy.hitboxes.neck) {
                            enemy.hitboxes.neck.snap_weight = 99999.0;
                            enemy.hitboxes.neck.friction = 0.96;
                            enemy.hitboxes.neck.priority = "HIGHEST";
                        }
                    } else {
                        // STAGE 2 (80-220ms): Boost Head cực mạnh + Đồng bộ BoneHash
                        const headHitbox = enemy.hitboxes.head;
                        if (headHitbox) {
                            headHitbox.snap_weight = 99999.0;
                            headHitbox.friction = 1.0;
                            headHitbox.priority = "HIGHEST";
                            headHitbox._omniBoost = 99999.0;
                            headHitbox._boneHash = this.HEAD_BONE_HASH;
                        }
                        // Giảm ma sát cổ để chuyển tâm lướt lên mượt
                        if (enemy.hitboxes.neck) enemy.hitboxes.neck.friction = 0.35;
                    }
                }

                // TRIỆT TIÊU HOÀN TOÀN LỰC KÉO XUỐNG THÂN DƯỚI (MỌI LÚC)
                const junkParts = ['chest', 'spine', 'pelvis', 'legs', 'arms', 'left_arm', 'right_arm', 'left_leg', 'right_leg'];
                for (let p = 0; p < junkParts.length; p++) {
                    if (enemy.hitboxes[junkParts[p]]) {
                        enemy.hitboxes[junkParts[p]].snap_weight = -99999.0;
                        enemy.hitboxes[junkParts[p]].friction = 0.0;
                        enemy.hitboxes[junkParts[p]].priority = "IGNORE";
                    }
                }
            }

            // TÍNH ĐIỂM ĐE DỌA (THREAT SCORE) THEO FOV & KHOẢNG CÁCH
            if (enemy.is_dead || enemy.hp <= 0 || enemy.is_knocked || !enemy.pos) continue;
            if (enemy.team_id !== undefined && enemy.team_id === _global.__OmniState.team_id) continue;

            const dx = enemy.pos.x - selfState.anchorPos.x;
            const dy = enemy.pos.y - selfState.anchorPos.y;
            const dz = enemy.pos.z - selfState.anchorPos.z;
            const distance3D = Math.sqrt(dx*dx + dy*dy + dz*dz);

            if (distance3D > 300.0) continue; // Bỏ qua địch quá xa

            let threatScore = distance3D;
            let angleToEnemy = Math.atan2(dx, dz) * (180.0 / Math.PI);
            let fovDiff = Math.abs(this.normalizeAngle(angleToEnemy - currentYaw));
            let fovPenalty = fovDiff * (distance3D < 10.0 ? 1.0 : 3.5);
            threatScore += fovPenalty;

            if (threatScore < lowestThreatScore) {
                lowestThreatScore = threatScore;
                bestTarget = enemy;
                bestTarget.distance = distance3D;
                bestTarget.fireElapsed = fireElapsed;
            }
        }

        // ====================================================================
        // 3. KINEMATIC PREDICTION (DỰ ĐOÁN QUỸ ĐẠO BẬC 3)
        // ====================================================================
        if (bestTarget) {
            const targetState = _global.__OmniState.target;
            const tracker = _global.__OmniState.tracker;
            const selfVel = selfState.vel || {x:0, y:0, z:0};

            // [UPGRADE 2]: KÍCH HOẠT FLUSH STATE NẾU ĐỔI MỤC TIÊU
            if (targetState.id !== bestTarget.id) {
                this.flushTrackerState(bestTarget.id);
            }

            targetState.id = bestTarget.id;
            targetState.distance = bestTarget.distance;
            targetState.isFiringMode = isFiring;
            targetState.fireElapsed = bestTarget.fireElapsed;

            // Tính tâm Đầu ảo (Virtual Head Center)
            let headCenter = { x: bestTarget.pos.x, y: bestTarget.pos.y + 1.52, z: bestTarget.pos.z };
            if (bestTarget.hitboxes?.head?.pos) {
                headCenter = { ...bestTarget.hitboxes.head.pos };
            }

            let targetAimPos = headCenter;
            targetState.pos = { ...targetAimPos };

            let trackData = tracker[bestTarget.id];
            trackData.history.unshift({ pos: { ...targetAimPos }, time: currentTime });
            if (trackData.history.length > 18) trackData.history.pop();

            let prevFrame = trackData.history[1] || trackData.history[0];
            
            // Tính toán Delta Time (dt)
            let dt = (currentTime - prevFrame.time) / 1000.0;
            
            // [UPGRADE 3]: CLAMP DELTATIME - CHỐNG LAG SPIKE GÂY VỌT TÂM
            // Không cho phép dt vượt quá 0.05s (tương đương 20 FPS). Nếu lag hơn, coi như dt = 0.05
            if (dt > 0.0) { 
                dt = Math.min(Math.max(dt, 0.001), 0.05);

                // Tính Vận tốc Tương đối (Bản thân - Địch)
                let raw_vx = (targetAimPos.x - prevFrame.pos.x) / dt;
                let raw_vy = (targetAimPos.y - prevFrame.pos.y) / dt;
                let raw_vz = (targetAimPos.z - prevFrame.pos.z) / dt;

                let rel_vx = raw_vx - selfVel.x;
                let rel_vy = raw_vy - selfVel.y;
                let rel_vz = raw_vz - selfVel.z;

                let alphaV = isFiring ? 0.72 : 0.55;
                let vx = (rel_vx * alphaV) + (trackData.velocity.x * (1 - alphaV));
                let vy = (rel_vy * alphaV) + (trackData.velocity.y * (1 - alphaV));
                let vz = (rel_vz * alphaV) + (trackData.velocity.z * (1 - alphaV));
                
                trackData.velocity = { x: vx, y: vy, z: vz };
                targetState.velocity = { x: vx, y: vy, z: vz };

                // Tính Gia Tốc (Accel) và Độ Giật (Jerk)
                let ax = 0, ay = 0, az = 0;
                if (trackData.lastVelocity) {
                    ax = (vx - trackData.lastVelocity.x) / dt;
                    ay = (vy - trackData.lastVelocity.y) / dt;
                    az = (vz - trackData.lastVelocity.z) / dt;
                }
                trackData.lastVelocity = { x: vx, y: vy, z: vz };

                let jx = 0, jy = 0, jz = 0;
                if (trackData.lastAccel) {
                    jx = (ax - trackData.lastAccel.x) / dt;
                    jy = (ay - trackData.lastAccel.y) / dt;
                    jz = (az - trackData.lastAccel.z) / dt;
                }
                trackData.lastAccel = { x: ax, y: ay, z: az };

                // 4. PREDICTION VÀ UPWARD ASSIST (TĂNG CƯỜNG CAO ĐỘ)
                let timeToTarget = isFiring ? 0.089 : 0.096;
                let accelMagXZ = Math.sqrt(ax*ax + az*az);
                let strafeDampener = (accelMagXZ > 45 ? 0.28 : (accelMagXZ > 18 ? 0.65 : 1.0));

                let predX = targetAimPos.x + (vx * timeToTarget) + (0.5 * ax * Math.pow(timeToTarget, 2) * strafeDampener);
                let predZ = targetAimPos.z + (vz * timeToTarget) + (0.5 * az * Math.pow(timeToTarget, 2) * strafeDampener);
                let predY = targetAimPos.y + (vy * timeToTarget);

                // Nếu địch nhảy hoặc đang ở Stage 2 -> Bơm thêm Pitch bằng rel_vy
                let speed = Math.sqrt(vx*vx + vy*vy + vz*vz);
                let isJumping = Math.abs(vy) > 1.3 && speed <= 14.0;
                
                if (isJumping || (isFiring && fireElapsed > 80)) {
                    // Đẩy cao độ dự đoán lên để M7 vuốt camera mạnh hơn
                    predY += Math.max(0, rel_vy * 0.48); 
                }

                targetState.predicted_pos = { x: predX, y: predY, z: predZ };
            } else {
                targetState.predicted_pos = { ...targetAimPos };
                targetState.velocity = {x:0, y:0, z:0};
            }
        } else {
            // Không có mục tiêu -> Clear sạch
            _global.__OmniState.target = { 
                id: null, pos: null, predicted_pos: null, distance: 999.0, 
                velocity: {x:0, y:0, z:0}, isFiringMode: false 
            };
        }

        return payload;
    }
}

// ============================================================================
// MODULE 7: CAMERA MANIPULATOR V14.5 – DUAL-PHASE ESCAPE & ZERO-JITTER
// Nhiệm vụ: Dịch ngược 3D sang Góc Euler, Búng tâm thoát hố đen (Torso Trap),
//           Hãm phanh hạ cánh mượt, và Khóa tĩnh tâm (Deadzone) chống Jitter.
// ============================================================================
class CameraManipulator {
    
    // --- CALIBRATION CONSTANTS (HẰNG SỐ VẬT LÝ) ---
    static TRAP_THRESHOLD_DY = 1.2;     // Độ lệch Pitch (Độ) tối thiểu để coi là đang xa đầu
    static STALL_SPEED = 0.035;         // Vận tốc quét Camera (Độ/frame) <= mức này là bị kẹt bụng
    static DEADZONE = 0.08;             // Vùng tĩnh lặng: Lệch < 0.08 độ -> Đóng băng tâm súng
    
    static BRAKE_ALPHA = 0.65;          // Hệ số phanh gấp sau khi búng (Càng nhỏ càng khựng nhanh)
    static SMOOTH_ALPHA = 0.9992;       // Hệ số trượt mượt thông thường

    static normalizeAngle(angle) {
        while (angle > 180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }

    static resetState(camState) {
        camState.escapeFrames = 0;
        camState.isTrapped = false;
        camState.justEscaped = false;
    }

    static execute(payload) {
        let state = _global.__OmniState;
        
        // Bypass an toàn nếu không có dữ liệu mục tiêu hoặc không bấm bắn
        if (!state.target.id || !state.weapon.isFiring || !state.target.predicted_pos) {
            this.resetState(state.camera);
            return payload;
        }

        let camState = state.camera;
        
        // Tùy thuộc vào game, góc Camera có thể nằm ở payload.camera hoặc payload.aim_pitch
        let currentPitch = payload.camera ? payload.camera.pitch : (payload.aim_pitch || 0);
        let currentYaw = payload.camera ? payload.camera.yaw : (payload.aim_yaw || 0);

        // ==========================================================
        // 1. TRIGONOMETRY ENGINE (DỊCH MÃ 3D -> GÓC EULER CAMERA)
        // ==========================================================
        let origin = payload.fire_origin || state.self.anchorPos;
        let dest = state.target.predicted_pos;

        let dx = dest.x - origin.x;
        let dy = dest.y - origin.y;
        let dz = dest.z - origin.z;
        
        // Khoảng cách mặt phẳng ngang (Trục XZ)
        let distXZ = Math.sqrt(dx * dx + dz * dz);
        if (distXZ === 0) distXZ = 0.0001; // Tránh lỗi chia cho 0

        // Dùng atan2 để tính góc. Lưu ý: Trong nhiều Engine (như Unity), Pitch nhìn lên là số âm
        // Chúng ta lấy tọa độ mục tiêu trừ đi trục nhìn để ra góc cần xoay
        let targetYaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
        let targetPitch = -Math.atan2(dy, distXZ) * (180.0 / Math.PI); 

        // Tính sai số cần bù đắp (Delta)
        let errorPitch = this.normalizeAngle(targetPitch - currentPitch);
        let errorYaw = this.normalizeAngle(targetYaw - currentYaw);
        
        // Tính vận tốc Camera hiện tại để phát hiện kẹt
        let currentSpeed = Math.abs(currentPitch - (camState.lastPitch || currentPitch));

        // ==========================================================
        // 2. TRAP DETECTION & DUAL-PHASE ESCAPE (BÚNG TÂM THOÁT BỤNG)
        // ==========================================================
        let escapeK = camState.escapeK || 0.45; // Lực búng lấy từ Hot-Tuning
        let escapeT = camState.escapeT || 4;    // Số frame duy trì lực

        // Đang kẹt ở bụng? (Tâm ở xa đầu + Không di chuyển được do ma sát game)
        if (camState.escapeFrames === 0 && !camState.justEscaped) {
            if (Math.abs(errorPitch) > this.TRAP_THRESHOLD_DY && currentSpeed < this.STALL_SPEED) {
                camState.isTrapped = true;
                camState.escapeFrames = escapeT; // Bơm xăng kích hoạt búng
            }
        }

        let nextPitch = currentPitch;
        let nextYaw = currentYaw; // Yaw thường không bị kẹt lực kéo Y, có thể dùng nội suy đơn giản

        // PHASE 1: QUADRATIC IMPULSE (BÚNG BẬC 2)
        if (camState.escapeFrames > 0) {
            let intensity = (camState.escapeFrames / escapeT); 
            // Hàm suy hao bậc 2: Lực búng x Tỉ lệ^2. Frame 1 mạnh nhất, frame 4 yếu dần.
            let impulseForce = escapeK * errorPitch * (intensity * intensity); 
            
            nextPitch = currentPitch + impulseForce;
            
            camState.escapeFrames--;
            if (camState.escapeFrames === 0) {
                camState.justEscaped = true; // Bật cờ sẵn sàng bung dù hạ cánh
            }
        } 
        // PHASE 2: BRAKE & GLIDE (HẠ CÁNH VÀ KHÓA TĨNH)
        else {
            // [CƠ CHẾ MỚI]: ABSOLUTE ZERO DEADZONE - SÁT THỦ DIỆT JITTER
            if (Math.abs(errorPitch) < this.DEADZONE) {
                nextPitch = currentPitch; // Tâm đã vào form Đầu -> Khóa cứng, từ chối tính toán thêm!
                camState.justEscaped = false;
            } else {
                // Nếu chưa vào Deadzone, tiếp tục trượt
                let currentAlpha = camState.justEscaped ? this.BRAKE_ALPHA : this.SMOOTH_ALPHA;
                nextPitch = currentPitch + (errorPitch * (1 - currentAlpha));
            }
        }

        // Bù trừ Yaw mượt mà (Không cần xung lực vì trục ngang ít bị kẹt ma sát)
        if (Math.abs(errorYaw) < this.DEADZONE) {
            nextYaw = currentYaw;
        } else {
            nextYaw = currentYaw + (errorYaw * 0.45); // Snap ngang tốc độ trung bình
        }

        // Lưu trạng thái
        camState.lastPitch = nextPitch;
        
        // Ghi đè vào payload để đẩy lên máy chủ / giao diện game
        if (payload.camera) {
            payload.camera.pitch = nextPitch;
            payload.camera.yaw = nextYaw;
        } else {
            payload.aim_pitch = nextPitch;
            payload.aim_yaw = nextYaw;
        }

        return payload;
    }
}

// ============================================================================
// MODULE 5: SELF KINEMATICS V14.5 – ZERO-LAG INERTIA NULLIFICATION
// Nhiệm vụ: Neo vị trí (Chronos Anchor), Bù trừ vận tốc tương đối (Tự thân vs Địch),
//           Thay thế SMA bằng Weighted EMA để triệt tiêu độ trễ pha khi Strafe.
// ============================================================================
class SelfKinematics {
    
    // --- CALIBRATION CONSTANTS ---
    static VELOCITY_EMA_ALPHA = 0.85; // Bám sát hiện tại (85% frame mới, 15% frame cũ) - Chống trễ pha

    static execute(payload) {
        const state = _global.__OmniState.self;
        const targetState = _global.__OmniState.target;
        const weaponState = _global.__OmniState.weapon;
        const camState = _global.__OmniState.camera || {};
        const profile = _global.__OmniState.weaponProfile || {};

        const isFiring = weaponState.isFiring || weaponState.triggerFired || payload.is_firing || false;
        const currentTime = Date.now();
        
        const fireElapsed = camState.fireStartTime 
            ? (currentTime - camState.fireStartTime) 
            : 999999;
            
        const isStage2 = fireElapsed > 80 && fireElapsed <= 220;
        const isCriticalWindow = isFiring && fireElapsed <= 220;

        // Khởi tạo vùng nhớ nếu chưa có
        if (!state.lastAnchor) state.lastAnchor = null;
        if (!state.emaVelocity) state.emaVelocity = {x: 0, y: 0, z: 0};

        // ====================================================================
        // 1. CHRONOS ANCHOR (NEO VỊ TRÍ GỐC)
        // ====================================================================
        if (!isFiring) {
            // Khi không bắn, liên tục cập nhật điểm neo gốc
            if (payload.anchorPos !== undefined) {
                state.lastAnchor = { ...payload.anchorPos };
            }
            // Reset bộ lọc EMA khi nhả cò để tránh rác quán tính
            if (payload.velocity !== undefined) {
                state.emaVelocity = { ...payload.velocity };
            }
            return payload;
        }

        // KHI ĐANG BẮN: Ép chặt tọa độ vào điểm Neo để chống rung nhân vật
        if (payload.anchorPos !== undefined && state.lastAnchor) {
            payload.anchorPos.x = state.lastAnchor.x;
            payload.anchorPos.y = state.lastAnchor.y;
            payload.anchorPos.z = state.lastAnchor.z;
        }

        // ====================================================================
        // 2. DYNAMIC FIRE-ORIGIN (ĐỒNG BỘ ĐIỂM XUẤT PHÁT ĐẠN)
        // ====================================================================
        if (payload.fire_origin !== undefined && targetState.predicted_pos) {
            if (targetState.distance < 4.8) {
                // [Cận Chiến < 5m]: Đưa nòng súng dính sát mặt địch để tránh méo FOV
                payload.fire_origin = {
                    x: targetState.predicted_pos.x,
                    y: targetState.predicted_pos.y,
                    z: targetState.predicted_pos.z - 0.04
                };
            } else if (state.lastAnchor) {
                // [Tầm Trung/Xa]: Nâng cao điểm xuất phát đạn để bắn qua vật cản ngang cổ
                const yOffset = isStage2 ? 1.72 : 1.64; 
                payload.fire_origin = {
                    x: state.lastAnchor.x,
                    y: state.lastAnchor.y + yOffset,
                    z: state.lastAnchor.z
                };
            }
        }

        // ====================================================================
        // 3. RELATIVE INERTIA NULLIFICATION (TRIỆT TIÊU QUÁNSTÍNH TƯƠNG ĐỐI)
        // ====================================================================
        if (weaponState.triggerFired || isCriticalWindow) {
            
            // A. Lọc Vector Vận tốc Bản thân bằng Weighted EMA (Siêu mượt, không trễ)
            if (payload.velocity !== undefined) {
                let rawV = payload.velocity;
                state.emaVelocity.x = (rawV.x * this.VELOCITY_EMA_ALPHA) + (state.emaVelocity.x * (1 - this.VELOCITY_EMA_ALPHA));
                state.emaVelocity.y = (rawV.y * this.VELOCITY_EMA_ALPHA) + (state.emaVelocity.y * (1 - this.VELOCITY_EMA_ALPHA));
                state.emaVelocity.z = (rawV.z * this.VELOCITY_EMA_ALPHA) + (state.emaVelocity.z * (1 - this.VELOCITY_EMA_ALPHA));
            }

            // B. Đóng băng vận tốc tuyệt đối truyền cho Engine Game
            if (payload.velocity !== undefined) {
                payload.velocity = { x: 0.0, y: 0.0, z: 0.0 };
            }
            if (payload.acceleration !== undefined) {
                payload.acceleration = { x: 0.0, y: 0.0, z: 0.0 };
            }

            // C. Bù trừ Vận tốc tương đối (Relative Velocity)
            // Nếu bạn chạy sang trái (-X) và địch chạy sang phải (+X), lực xé tâm sẽ gấp đôi.
            // Đoạn code này ép engine tin rằng cả 2 đang đứng im tương đối với nhau.
            if (targetState.velocity && state.emaVelocity) {
                const brakingStrength = isStage2 ? 1.0 : 0.92;
                
                // V_relative = V_target - V_self
                const relVel = {
                    x: targetState.velocity.x - state.emaVelocity.x,
                    y: targetState.velocity.y - state.emaVelocity.y,
                    z: targetState.velocity.z - state.emaVelocity.z
                };
                
                // Trừ ngược vào payload để Game Engine tự hãm phanh
                if(payload.velocity) {
                    payload.velocity.x -= relVel.x * brakingStrength;
                    payload.velocity.y -= relVel.y * brakingStrength;
                    payload.velocity.z -= relVel.z * brakingStrength;
                }
            }

            // D. Stance Spoofing (Hack tư thế)
            if (payload.speed !== undefined) payload.speed = 0.0;
            if (payload.is_moving !== undefined) payload.is_moving = false;

            if (payload.stance !== undefined) {
                // Ép trạng thái về 0 (Đứng yên) để hưởng độ chụm đạn tối đa của engine
                if (profile.Core === "ONETAP" || profile.Core === "SHOTGUN" || isStage2) {
                    payload.stance = 0; 
                }
            }
        }

        // Cập nhật điểm Neo cuối cùng
        if (payload.anchorPos !== undefined) {
            state.lastAnchor = { ...payload.anchorPos };
        }

        return payload;
    }
}

// ============================================================================
// MODULE 6.5: TRIGGER CHECK V14.5 – PREDICTIVE AI & STAGED EXECUTION
// Nhiệm vụ: Đánh giá Hitchance (Tỉ lệ trúng), Quyết định Auto-fire thông minh,
//           Đồng bộ hóa khung thời gian 0.2s (Critical Window) cho toàn hệ thống.
// ============================================================================
class TriggerCheck {
    
    static execute(payload) {
        const state = _global.__OmniState;
        const targetState = state.target;
        const weaponState = state.weapon;
        const profile = state.weaponProfile;
        const camState = state.camera || {};

        // ==========================================================
        // 1. RESET CHU KỲ & ĐỌC TÍN HIỆU GỐC
        // ==========================================================
        weaponState.triggerFired = false;
        weaponState.forceAbsoluteSnap = false;

        if (profile.Core === "IGNORE") return payload;

        // Đọc tín hiệu bấm bắn từ màn hình cảm ứng / chuột của người chơi
        let isManualFiring = payload.is_firing || (payload.weapon && payload.weapon.is_firing) || false;

        // Nếu mất mục tiêu, trả lại quyền điều khiển tự do cho người chơi
        if (!targetState.id || !targetState.predicted_pos) {
            if (!isManualFiring) {
                camState.fireStartTime = 0; // Xóa mốc thời gian nếu không bắn
            }
            return payload;
        }

        // ==========================================================
        // 2. STAGED TIMING (ĐỒNG BỘ KHUNG THỜI GIAN 0.2S)
        // ==========================================================
        const currentTime = Date.now();
        
        // Cập nhật mốc thời gian bắt đầu nhả đạn
        if (isManualFiring && !camState.fireStartTime) {
            camState.fireStartTime = currentTime;
        }

        const fireElapsed = camState.fireStartTime ? (currentTime - camState.fireStartTime) : 99999;
        
        // Định nghĩa các Giai đoạn (Stages)
        const isStage1 = fireElapsed <= 80;                     // Giai đoạn 1: Lướt mượt từ Cổ
        const isStage2 = fireElapsed > 80 && fireElapsed <= 220;  // Giai đoạn 2: Bám cứng Đầu
        const isCriticalWindow = fireElapsed <= 220;            // Cửa sổ tử thần

        const tracker = state.tracker[targetState.id] || {};
        const distance = targetState.distance || 99999;
        const speed = tracker.velocity ? Math.sqrt(tracker.velocity.x**2 + tracker.velocity.z**2) : 0;

        // ==========================================================
        // 3. HITCHANCE ENGINE (ĐÁNH GIÁ TỈ LỆ TRÚNG MỤC TIÊU)
        // ==========================================================
        let hitchance = 100.0;
        const isTargetBehindCover = tracker.is_behind_cover || false;

        // Phạt tỉ lệ trúng nếu địch nấp sau vật cản (trừ súng OneTap có thể vẩy ngẫu nhiên)
        if (isTargetBehindCover && profile.Core !== "ONETAP") {
            hitchance = isStage2 ? 55.0 : 20.0; // Ở Stage 2, MagicBullet sẽ bẻ cong đạn nên tỉ lệ cao hơn
        }

        // Phạt tỉ lệ trúng nếu địch chạy quá nhanh ngang mặt ở khoảng cách xa
        if (speed > 8.5 && distance > 45) {
            hitchance *= isStage2 ? 0.85 : 0.60;
        }

        // Nếu điểm Hitchance quá thấp (< 35%), cấm hệ thống Auto-fire (tránh lộ liễu)
        // Nhưng nếu người chơi vẫn cố tình bấm bắn thủ công (Manual) thì hệ thống vẫn cho phép.

        // ==========================================================
        // 4. PREDICTIVE PRE-FIRE AI (TRÍ TUỆ TIỀN-HỎA)
        // ==========================================================
        let shouldAutoFire = false;

        if (hitchance >= 35.0) {
            // A. Tự động tỉa OneTap (Khi địch đứng im, chạy chậm, hoặc thò đầu)
            if (profile.Core === "ONETAP" && speed < 2.5 && !isTargetBehindCover && distance < 120) {
                shouldAutoFire = true;
            }

            // B. Tự động sấy Shotgun CQC (Địch ở gần <15m và tâm Y đã sát đầu)
            if (profile.Core === "SHOTGUN" && distance < 15) {
                let yDiff = Math.abs(targetState.predicted_pos.y - targetState.pos.y);
                if (yDiff < 1.5) shouldAutoFire = true;
            }

            // C. Bắt bài đối phương nhảy (Jump Catch)
            if (targetState.velocity && targetState.velocity.y > 1.2) {
                shouldAutoFire = true; // Kích cò ngay khi địch đang lơ lửng
            }
        }

        // ==========================================================
        // 5. THỰC THI LỆNH (EXECUTION)
        // ==========================================================
        const shouldFire = isManualFiring || shouldAutoFire;

        if (shouldFire) {
            payload.is_firing = true;
            if (payload.weapon) {
                payload.weapon.is_firing = true;
                
                // Max Sạc (Charge) cho các súng tích lực như Charge Buster/CG15
                if (payload.weapon.charge_time !== undefined) {
                    payload.weapon.charge_time = 99999.0;
                }
            }

            weaponState.isFiring = true;
            weaponState.triggerFired = true;

            // Kích hoạt Cưỡng chế bám tâm tuyệt đối cho Magic Bullet ở Stage 2
            weaponState.forceAbsoluteSnap = isStage2;

            // Ghi nhận mốc thời gian nếu AutoFire vừa tự kích hoạt
            if (!camState.fireStartTime) {
                camState.fireStartTime = currentTime;
            }
        } else {
            camState.fireStartTime = 0; // Dọn rác thời gian nếu ngừng bắn
        }

        return payload;
    }
}

// ============================================================================
// LÕI VŨ KHÍ: SHOTGUN CORE V4.5 (ZERO-ALLOCATION)
// Nhiệm vụ: Gom chùm đạn hoa cải thành tia Laser duy nhất, xóa Recoil/Spread.
// ============================================================================
class ShotgunCore {
    static execute(payload) {
        const state = _global.__OmniState;
        const targetState = state.target;
        const weaponState = state.weapon;
        const camState = state.camera || {};

        const fireElapsed = camState.fireStartTime ? (Date.now() - camState.fireStartTime) : 99999;
        const isCriticalWindow = weaponState.isFiring && fireElapsed <= 220;

        // 1. TRIỆT TIÊU VẬT LÝ SÚNG
        if (payload.weapon) {
            payload.weapon.recoil_y = 0.0;
            payload.weapon.recoil_x = 0.0;
            payload.weapon.recoil_accumulation = 0.0;
            payload.weapon.base_spread = 0.0;
            payload.weapon.dynamic_spread = 0.0;
            payload.weapon.max_spread = 0.0;
            payload.weapon.spread_add_per_shot = 0.0;
            payload.weapon.inaccuracy_move = 0.0;
            payload.weapon.inaccuracy_jump = 0.0;
            payload.weapon.inaccuracy_crouch = 0.0;
        }

        // 2. GOM CHÙM ĐẠN (PELLET CONCENTRATION)
        if (payload.bullet_events && targetState.predicted_pos && state.self.anchorPos) {
            const origin = payload.fire_origin || state.self.anchorPos;
            const dest = targetState.predicted_pos;

            let dx = dest.x - origin.x, dy = dest.y - origin.y, dz = dest.z - origin.z;
            const mag = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1.0;
            
            // Tính toán trước Vector chuẩn để không phải tạo Object mới trong vòng lặp
            const pX = dx/mag, pY = dy/mag, pZ = dz/mag;

            for (let i = 0; i < payload.bullet_events.length; i++) {
                let pellet = payload.bullet_events[i];
                if (!pellet.ray_dir) pellet.ray_dir = {};
                pellet.ray_dir.x = pX; pellet.ray_dir.y = pY; pellet.ray_dir.z = pZ;
                pellet.target_id = targetState.id;

                if (isCriticalWindow) {
                    pellet.is_penetrating = true;
                    pellet.collision_obstacle = false;
                    pellet.deviation = 0.0;
                    pellet.spread_angle = 0.0;
                }
            }
        }

        // 3. DAMAGE BONE-OVERRIDE
        if (payload.damage_report) {
            payload.damage_report.hit_bone = 8; // HEAD
            payload.damage_report.is_headshot = true;
            payload.damage_report.distance_penalty = 0.0;
            payload.damage_report.armor_penetration = 1.0;
            payload.damage_report.ignore_armor = true;
            payload.damage_report.penetration_ratio = 1.0;

            if (isCriticalWindow && payload.damage_report.damage_multiplier !== undefined) {
                payload.damage_report.damage_multiplier = 1.18;
            }
        }
        return payload;
    }
}

// ============================================================================
// LÕI VŨ KHÍ: AUTO CORE V4.5 (ZERO-ALLOCATION)
// Nhiệm vụ: Biến đạn sấy SMG/AR thành một đường thẳng tắp không giật.
// ============================================================================
class AutoCore {
    static execute(payload) {
        const state = _global.__OmniState;
        const targetState = state.target;
        const weaponState = state.weapon;
        const camState = state.camera || {};

        const fireElapsed = camState.fireStartTime ? (Date.now() - camState.fireStartTime) : 99999;
        const isCriticalWindow = weaponState.isFiring && fireElapsed <= 220;

        if (payload.weapon) {
            payload.weapon.recoil_y = 0.0; payload.weapon.recoil_x = 0.0; payload.weapon.recoil_accumulation = 0.0;
            payload.weapon.base_spread = 0.0; payload.weapon.dynamic_spread = 0.0; payload.weapon.max_spread = 0.0;
            payload.weapon.spread_add_per_shot = 0.0;
            payload.weapon.inaccuracy_move = 0.0; payload.weapon.inaccuracy_jump = 0.0; payload.weapon.inaccuracy_crouch = 0.0;
        }

        if (payload.bullet_events && targetState.predicted_pos && state.self.anchorPos) {
            const origin = payload.fire_origin || state.self.anchorPos;
            const dest = targetState.predicted_pos;
            let dx = dest.x - origin.x, dy = dest.y - origin.y, dz = dest.z - origin.z;
            const mag = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1.0;
            const pX = dx/mag, pY = dy/mag, pZ = dz/mag;

            for (let i = 0; i < payload.bullet_events.length; i++) {
                let bullet = payload.bullet_events[i];
                if (!bullet.ray_dir) bullet.ray_dir = {};
                bullet.ray_dir.x = pX; bullet.ray_dir.y = pY; bullet.ray_dir.z = pZ;
                bullet.target_id = targetState.id;

                if (isCriticalWindow) {
                    bullet.is_penetrating = true; bullet.collision_obstacle = false;
                    bullet.deviation = 0.0; bullet.spread_angle = 0.0; bullet.angular_velocity = 0.0;
                }
            }
        }

        if (payload.damage_report) {
            payload.damage_report.hit_bone = 8; payload.damage_report.is_headshot = true;
            payload.damage_report.distance_penalty = 0.0; payload.damage_report.armor_penetration = 1.0;
            payload.damage_report.ignore_armor = true; payload.damage_report.penetration_ratio = 1.0;
            if (isCriticalWindow && payload.damage_report.damage_multiplier !== undefined) {
                payload.damage_report.damage_multiplier = 1.16;
            }
        }
        return payload;
    }
}

// ============================================================================
// LÕI VŨ KHÍ: ONETAP CORE V4.5 (ZERO-ALLOCATION)
// Nhiệm vụ: Tối đa hóa sát thương, ép recovery cực nhanh để vẩy đạn liên tục.
// ============================================================================
class OneTapCore {
    static execute(payload) {
        const state = _global.__OmniState;
        const targetState = state.target;
        const weaponState = state.weapon;
        const camState = state.camera || {};

        const fireElapsed = camState.fireStartTime ? (Date.now() - camState.fireStartTime) : 99999;
        const isCriticalWindow = weaponState.isFiring && fireElapsed <= 220;

        if (payload.weapon) {
            payload.weapon.base_spread = 0.0; payload.weapon.dynamic_spread = 0.0;
            payload.weapon.recoil_y = 0.0; payload.weapon.recoil_x = 0.0;
            payload.weapon.recoil_recovery = 99999.0; // Phục hồi siêu nhanh sau 1 viên
            payload.weapon.inaccuracy_move = 0.0; payload.weapon.inaccuracy_jump = 0.0; payload.weapon.inaccuracy_crouch = 0.0;
        }

        if (payload.bullet_events && targetState.predicted_pos && state.self.anchorPos) {
            const origin = payload.fire_origin || state.self.anchorPos;
            const dest = targetState.predicted_pos;
            let dx = dest.x - origin.x, dy = dest.y - origin.y, dz = dest.z - origin.z;
            const mag = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1.0;
            const pX = dx/mag, pY = dy/mag, pZ = dz/mag;

            for (let i = 0; i < payload.bullet_events.length; i++) {
                let bullet = payload.bullet_events[i];
                if (!bullet.ray_dir) bullet.ray_dir = {};
                bullet.ray_dir.x = pX; bullet.ray_dir.y = pY; bullet.ray_dir.z = pZ;
                bullet.target_id = targetState.id;

                if (isCriticalWindow) {
                    bullet.deviation = 0.0; bullet.is_penetrating = true;
                    bullet.collision_obstacle = false; bullet.angular_velocity = 0.0;
                }
            }
        }

        if (payload.damage_report) {
            payload.damage_report.hit_bone = 8; payload.damage_report.is_headshot = true;
            payload.damage_report.distance_penalty = 0.0; payload.damage_report.armor_penetration = 1.0;
            payload.damage_report.ignore_armor = true; payload.damage_report.penetration_ratio = 1.0;
            if (isCriticalWindow && payload.damage_report.damage_multiplier !== undefined) {
                payload.damage_report.damage_multiplier = 1.25; // Sát thương cao nhất
            }
        }
        return payload;
    }
}

// ============================================================================
// MODULE 8: MAGIC BULLET CORE V14.5 – THE ULTIMATE HITSCAN OVERRIDE
// Nhiệm vụ: Bẻ cong tia đạn, dọn dẹp các sai số cuối cùng, EMA Vector chống Jitter,
//           Shrink hitbox địch gần nhau để chống Overlap (đạn bay nhầm người).
// ============================================================================
class MagicBulletCore {
    static execute(payload) {
        const state = _global.__OmniState;
        const targetState = state.target;
        const weaponState = state.weapon;
        const camState = state.camera || {};

        if (!targetState || !targetState.id || !targetState.predicted_pos) return payload;

        // Đồng bộ thời gian
        const fireElapsed = camState.fireStartTime ? (Date.now() - camState.fireStartTime) : 999999;
        const isStage2 = fireElapsed > 80 && fireElapsed <= 220;
        const isLateStage2 = fireElapsed > 140 && fireElapsed <= 220; 
        const isCriticalWindow = weaponState.isFiring && fireElapsed <= 220;

        // 1. MISS-TO-HIT INVERSION (Biến Trượt thành Trúng)
        if (payload.miss_event || (payload.bullet_event && payload.bullet_event.is_hit === false)) {
            if (isStage2 || isCriticalWindow) {
                if (payload.miss_event) {
                    payload.hit_event = payload.miss_event; // Chuyển đổi con trỏ, không cấp phát thêm
                    delete payload.miss_event;
                }
                if (payload.bullet_event) payload.bullet_event.is_hit = true;
                if (!payload.hit_event) payload.hit_event = {};
                payload.hit_event.target_id = targetState.id;
            }
        }

        // 2. SMART ANTI-OVERLAP (Thu nhỏ Hitbox địch xung quanh để đạn lách qua)
        if (payload.players) {
            for (let i = 0; i < payload.players.length; i++) {
                let enemy = payload.players[i];
                if (enemy.id !== targetState.id && enemy.hitboxes) {
                    const shrinkRadius = isLateStage2 ? 0.003 : (isStage2 ? 0.005 : 0.008);
                    ['head', 'chest', 'pelvis', 'legs', 'arms'].forEach(part => {
                        if (enemy.hitboxes[part]) enemy.hitboxes[part].radius = shrinkRadius;
                    });
                }
            }
        }

        // 3. DYNAMIC SINGULARITY VECTOR (Tính tia đạn thần kỳ)
        let origin = payload.fire_origin || state.self.lastAnchor || state.self.anchorPos;
        if (origin && targetState.predicted_pos) {
            let dx = targetState.predicted_pos.x - origin.x;
            let dy = targetState.predicted_pos.y - origin.y;
            let dz = targetState.predicted_pos.z - origin.z;

            // Bù trừ Anti-overhead khi địch đang rớt xuống
            if (isStage2 && targetState.velocity) {
                const progress = isLateStage2 ? 1.0 : (fireElapsed - 80) / 140;
                dy += Math.max(0, targetState.velocity.y * 0.52 * (0.6 + 0.4 * progress));
                if (isLateStage2) dy += 0.018; // Micro Y-offset khóa cứng não
            }

            const mag = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1.0;
            let rawDirX = dx/mag, rawDirY = dy/mag, rawDirZ = dz/mag;

            // 4. JITTER REDUCTION BẰNG EMA VECTOR (Mượt hóa đường đạn)
            if (!camState.lastPerfectDir) {
                camState.lastPerfectDir = { x: rawDirX, y: rawDirY, z: rawDirZ };
            }
            const alphaDir = isLateStage2 ? 0.995 : 0.97;
            
            // Cập nhật Vector mượt trực tiếp vào State
            camState.lastPerfectDir.x = (rawDirX * alphaDir) + (camState.lastPerfectDir.x * (1 - alphaDir));
            camState.lastPerfectDir.y = (rawDirY * alphaDir) + (camState.lastPerfectDir.y * (1 - alphaDir));
            camState.lastPerfectDir.z = (rawDirZ * alphaDir) + (camState.lastPerfectDir.z * (1 - alphaDir));

            const pDir = camState.lastPerfectDir;

            // Áp tia đạn thần kỳ vào từng viên đạn
            if (payload.bullet_events) {
                for (let i = 0; i < payload.bullet_events.length; i++) {
                    let bullet = payload.bullet_events[i];
                    if (!bullet.ray_dir) bullet.ray_dir = {};
                    bullet.ray_dir.x = pDir.x; bullet.ray_dir.y = pDir.y; bullet.ray_dir.z = pDir.z;
                    bullet.target_id = targetState.id;
                    
                    bullet.spread_angle = 0.0; bullet.deviation = 0.0; bullet.angular_velocity = 0.0;
                    bullet.momentum_offset = 0.0; bullet.drift = 0.0; bullet.trajectory_curve = 0.0;
                    bullet.velocity_inheritance = 0.0; bullet.gravity_influence = 0.0; bullet.wind_effect = 0.0;
                    bullet.is_penetrating = false; bullet.collision_obstacle = true;

                    if (isLateStage2 || isCriticalWindow) {
                        bullet.is_penetrating = true;
                        bullet.collision_obstacle = false;
                    }
                }
            }

            // Ghi đè Hit Pos và Ray Dir cuối cùng cho Damage Report
            if (payload.damage_report || payload.hit_event) {
                let report = payload.damage_report || payload.hit_event;
                report.target_id = targetState.id;
                report.hit_bone = 8; 
                report.is_headshot = true;
                
                if (!report.hit_pos) report.hit_pos = {};
                report.hit_pos.x = targetState.predicted_pos.x;
                report.hit_pos.y = targetState.predicted_pos.y;
                report.hit_pos.z = targetState.predicted_pos.z;

                if (report.ray_dir) {
                    report.ray_dir.x = pDir.x; report.ray_dir.y = pDir.y; report.ray_dir.z = pDir.z;
                }

                report.distance_penalty = 0.0; report.armor_penetration = 1.0; report.ignore_armor = true; 
                if (isCriticalWindow && report.damage_multiplier !== undefined) {
                    report.damage_multiplier = isLateStage2 ? 1.35 : (isStage2 ? 1.25 : 1.20);
                }
            }
        }

        return payload;
    }
}

// ============================================================================
// BỘ ĐIỀU PHỐI TỔNG (MATRIX DISPATCHER V2.8 - ZERO STUTTER)
// Nhiệm vụ: Đệ quy Payload, tiệt trùng Telemetry và vận hành tuần tự các Module
// ============================================================================
class MatrixDispatcher {
    
    // [FIX 1]: ZERO-GC SANITIZER (Tiệt trùng không xả rác bộ nhớ)
    sanitizeTelemetry(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        // Chỉ quét các key khả nghi rõ ràng, không dùng Object.keys() bừa bãi
        if (obj.eventName || obj.cmd || obj.type) {
            const str = JSON.stringify(obj).toLowerCase();
            if (str.includes('report') || str.includes('hackkill') || str.includes('telemetry')) {
                return {}; // Vô hiệu hóa gói tin báo cáo
            }
        }
        return obj;
    }

    processPayload(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        // Đệ quy tìm kiếm sâu các nhánh dữ liệu (Làm trước để lấy đúng gốc data)
        const rootKeys = ['data', 'events', 'payload', 'messages', 'vessels'];
        for (let i = 0; i < rootKeys.length; i++) {
            const key = rootKeys[i];
            if (payload[key]) {
                if (Array.isArray(payload[key])) {
                    for (let j = 0; j < payload[key].length; j++) {
                        payload[key][j] = this.processPayload(payload[key][j]);
                    }
                } else if (typeof payload[key] === 'object') {
                    payload[key] = this.processPayload(payload[key]);
                }
            }
        }

        // ====================================================================
        // [FIX 2]: FAST BYPASS GATE (LƯỚI LỌC SIÊU TỐC CỨU FPS)
        // Nếu gói tin không chứa dữ liệu cần thiết (chỉ là xoay màn hình), 
        // TRẢ VỀ NGAY LẬP TỨC! Không tính toán toán học nặng.
        // ====================================================================
        const hasActionableData = payload.players || payload.weapon || payload.bullet_events || payload.damage_report || payload.camera || payload.aim_pitch !== undefined;
        
        if (!hasActionableData) {
            return payload; // Khách VIP đi thẳng, miễn kiểm tra!
        }

        // --- NẾU LỌT QUA LƯỚI, MỚI BẮT ĐẦU XỬ LÝ ---
        payload = this.sanitizeTelemetry(payload);
        payload = WeaponClassifier.execute(payload);

        if (_global.__OmniState.weaponProfile && _global.__OmniState.weaponProfile.Core !== "IGNORE") {
            payload = TargetKinematics.execute(payload);
            payload = CameraManipulator.execute(payload);
            payload = TriggerCheck.execute(payload);
            payload = SelfKinematics.execute(payload);

            const core = _global.__OmniState.weaponProfile.Core;
            if (core === "SHOTGUN") payload = ShotgunCore.execute(payload);
            else if (core === "AUTO") payload = AutoCore.execute(payload);
            else if (core === "ONETAP") payload = OneTapCore.execute(payload);

            payload = MagicBulletCore.execute(payload);
        }

        return payload;
    }
}

// ============================================================================
// TRÌNH BAO BỌC NATIVE KHÔNG GÂY RÁC BỘ NHỚ (SHORTCUT OPTIMIZED EXPORTS)
// ============================================================================

// Khởi tạo Engine duy nhất (Singleton)
if (!_global.__OMNI_ENGINE) {
    _global.__OMNI_ENGINE = new MatrixDispatcher();
}

function ProcessPayload(inputPayload) {
    try {
        let isString = typeof inputPayload === 'string';
        let payload = isString ? JSON.parse(inputPayload) : inputPayload;
        
        // Bơm trực tiếp vào Engine đang chạy ngầm, không tạo Object mới
        const mutated = _global.__OMNI_ENGINE.processPayload(payload);
        
        return isString ? JSON.stringify(mutated) : mutated;
    } catch (e) {
        return inputPayload; // Bypass an toàn nếu lỗi logic
    }
}

// Cổng giao tiếp cho phép Shortcut chỉnh thông số trực tiếp trong trận
function UpdateConfig(newConfig) {
    try {
        if (!_global.__OmniState) return false;
        
        if (newConfig.K_burst !== undefined || newConfig.T_max !== undefined) {
            _global.__OmniState.camera = _global.__OmniState.camera || {};
            if (newConfig.K_burst !== undefined) _global.__OmniState.camera.escapeK = newConfig.K_burst;
            if (newConfig.T_max !== undefined) _global.__OmniState.camera.escapeT = newConfig.T_max;
        }
        return true;
    } catch (e) {
        return false;
    }
}

// Đóng gói API để khóa chặt vào RAM của App
const OMNI_API = {
    ProcessPayload: ProcessPayload,
    UpdateConfig: UpdateConfig,
    Version: "MATRIX_V2.4_NATIVE"
};

if (typeof window !== 'undefined') window.OMNI_MATRIX = OMNI_API;
else if (typeof globalThis !== 'undefined') globalThis.OMNI_MATRIX = OMNI_API;
else _global.OMNI_MATRIX = OMNI_API;

if (typeof module !== 'undefined') module.exports = OMNI_API;
