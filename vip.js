/**
 * ==============================================================================
 * PROJECT: OMNI-MATRIX V2.5 [RAGE / ABSOLUTE LOCK]
 * Objective: Instant Snap, Zero-Inertia, Exact Bone Hash Tracking, Zero-GC
 * ==============================================================================
 */

// Định tuyến môi trường an toàn (Native App JSBridge hoặc WebView)
const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);

// ============================================================================
// 0. GLOBAL STATE (ZERO-PING SHARED MEMORY - RAGE EDITION)
// ============================================================================
if (!_global.__OmniState || _global.__OmniState.version !== "MATRIX_V2.5_RAGE") {
    _global.__OmniState = {
        version: "MATRIX_V2.5_RAGE",
        weaponProfile: { Core: "IGNORE", FireRateMod: 1.0 },
        
        target: { id: null, pos: null, predicted_pos: null, distance: 999.0, currentBoneHash: null },
        self: { pos: {x:0, y:0, z:0}, anchorPos: {x:0, y:0, z:0}, vel: {x:0, y:0, z:0}, lastAnchor: null },
        
        weapon: { isFiring: false, id: "", category: "", triggerFired: false, forceAbsoluteSnap: true }, 
        tracker: {}, 
        
        camera: {
            lastKineTime: 0,
            lastPitch: 0,
            prevYaw: 0
            // Đã xóa toàn bộ các biến Escape/EMA/Smooth vì bản RAGE sẽ dịch chuyển tức thời
        },

        // TÍCH HỢP BẢN ĐỒ XƯƠNG (BONE MAP) TỪ 2.JSON
        boneMap: {
            HEAD: -2111735698,
            NECK: 96688289,
            SPINE1: -1541408846, // Ngực trên
            SPINE: -1051086991,  // Bụng trên
            HIPS: 1529948125     // Hips thật (Đã loại bỏ Hips Dummy)
        }
    };
}

// ============================================================================
// MODULE 1: WEAPON CLASSIFIER V2.5 (RAGE TUNED)
// Nhiệm vụ: Phân loại luồng xử lý và thiết lập thông số cho Hard-Lock
// ============================================================================
class WeaponClassifier {
    
    static classify(weaponData) {
        let profile = { Core: "IGNORE", FireRateMod: 1.0 };
        if (!weaponData) return profile;

        const identifier = `${weaponData.id || ""}_${weaponData.name || ""}_${weaponData.category || ""}`.toUpperCase();

        if (identifier.includes("SHOTGUN") || identifier.includes("M1887") || 
            identifier.includes("M1014") || identifier.includes("SPAS") || identifier.includes("MAG-7")) {
            profile.Core = "SHOTGUN";
            profile.FireRateMod = 0.8; // Shotgun cần độ chính xác cục bộ cho 1 frame
        } 
        else if (identifier.includes("SNIPER") || identifier.includes("PISTOL") || 
                 identifier.includes("DESERT_EAGLE") || identifier.includes("WOODPECKER") || 
                 identifier.includes("AC80") || identifier.includes("AWM")) {
            profile.Core = "ONETAP";
            profile.FireRateMod = 1.0;
        } 
        else if (identifier.includes("SMG") || identifier.includes("AR") || 
                 identifier.includes("MACHINE") || identifier.includes("MP40") || 
                 identifier.includes("UMP") || identifier.includes("AK")) {
            profile.Core = "AUTO";
            profile.FireRateMod = 1.2; // SMG/AR sấy nhanh cần tăng tốc độ quét mục tiêu
        }

        return profile;
    }

    static execute(payload) {
        const weaponState = _global.__OmniState.weapon;

        // Bắt tín hiệu bắn tốc độ cao
        if (payload.is_firing !== undefined) {
            weaponState.isFiring = payload.is_firing;
        }

        if (payload.weapon) {
            if (payload.weapon.is_firing !== undefined) {
                weaponState.isFiring = payload.weapon.is_firing;
            }
            
            // Caching Logic: Tránh tính toán chuỗi String nếu không đổi súng
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
// MODULE 4: TARGET KINEMATICS V8.5 – ULTIMATE GEOMETRY (RAGE)
// Nhiệm vụ: Quét mục tiêu qua Screen-Space FOV (Chống kẹt bụng),
//           Dự đoán Parabol (Chống nhảy), Bộ lọc Kalman 2D (Chống lách ngang).
// ============================================================================
class TargetKinematics {
    
    // --- HẰNG SỐ VẬT LÝ TUYỆT ĐỐI ---
    static MAX_FOV_RADIUS = 35.0; // Bán kính FOV ảo trên màn hình (Độ)
    static GAME_GRAVITY = 18.5;   // Gia tốc trọng trường của Game (thường cao hơn 9.8 thực tế)
    static PREDICTION_TIME = 0.048; // Thời gian bay/Backtrack ảo (48ms)

    static normalizeAngle(angle) {
        while (angle > 180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }

    static flushTrackerState(targetId) {
        _global.__OmniState.tracker[targetId] = {
            history: [], 
            velocity: { x: 0, y: 0, z: 0 }
        };
    }

    static execute(payload) {
        const state = _global.__OmniState;
        const selfState = state.self;
        const camState = state.camera;
        const boneMap = state.boneMap;

        // Cập nhật vị trí bản thân
        if (payload.anchorPos !== undefined) selfState.anchorPos = { ...payload.anchorPos };
        if (payload.velocity !== undefined) selfState.vel = { ...payload.velocity };

        // Xóa sổ Aim-Assist gốc của Game để tránh bị giành quyền kiểm soát
        if (payload.aim_assist !== undefined) {
            payload.aim_assist.friction = 0.0;
            payload.aim_assist.adhesion = 0.0;
            payload.aim_assist.snap_weight = -99999.0;
        }

        if (!payload || !payload.players || !Array.isArray(payload.players)) return payload;
        if (!selfState.anchorPos || selfState.anchorPos.x === 0) return payload;

        const isFiring = state.weapon.isFiring || state.weapon.triggerFired || payload.is_firing || false;
        const currentTime = Date.now();
        
        // Điều tiết khung hình khi không bắn (Chống Stutter khi xoay màn hình)
        if (!isFiring) {
            if (currentTime - (camState.lastKineTime || 0) < 16) return payload; 
            camState.lastKineTime = currentTime;
        }

        const currentYaw = payload.aim_yaw !== undefined ? payload.aim_yaw : (camState.prevYaw || 0.0);
        const currentPitch = payload.aim_pitch !== undefined ? payload.aim_pitch : (camState.lastPitch || 0.0);
        
        if (payload.aim_yaw !== undefined) camState.prevYaw = payload.aim_yaw;
        if (payload.aim_pitch !== undefined) camState.lastPitch = payload.aim_pitch;

        let bestTarget = null;
        let lowestFov = 99999.0;

        // ====================================================================
        // [GIẢI QUYẾT BÀI TOÁN 1]: SCREEN-SPACE FOV & MULTI-BONE SCAN
        // ====================================================================
        for (let i = 0; i < payload.players.length; i++) {
            const enemy = payload.players[i];
            
            if (enemy.is_dead || enemy.hp <= 0 || enemy.is_knocked || !enemy.pos) continue;
            if (enemy.team_id !== undefined && enemy.team_id === state.team_id) continue;

            const dx = enemy.pos.x - selfState.anchorPos.x;
            const dy = enemy.pos.y - selfState.anchorPos.y;
            const dz = enemy.pos.z - selfState.anchorPos.z;
            const distance3D = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            if (distance3D > 280.0) continue; 

            // Tính góc Camera từ mình đến địch
            let distXZ = Math.sqrt(dx*dx + dz*dz) || 0.001;
            let enemyYaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
            let enemyPitch = -Math.atan2(dy, distXZ) * (180.0 / Math.PI);

            let deltaYaw = Math.abs(this.normalizeAngle(enemyYaw - currentYaw));
            let deltaPitch = Math.abs(this.normalizeAngle(enemyPitch - currentPitch));

            // THUẬT TOÁN W2S 2D: Tính khoảng cách chéo trên màn hình điện thoại
            let fov2D = Math.sqrt(deltaYaw*deltaYaw + deltaPitch*deltaPitch);

            // Bỏ qua nếu địch nằm ngoài Vòng từ tính ảo
            if (fov2D > this.MAX_FOV_RADIUS) continue;

            // XÓA BỎ LỰC HÚT VÀO THÂN DƯỚI (Torso Trap Nullification)
            if (enemy.hitboxes) {
                const junkBones = ['chest', 'spine', 'pelvis', 'legs', 'arms', 'bone_Hips_Dummy'];
                for (let p = 0; p < junkBones.length; p++) {
                    if (enemy.hitboxes[junkBones[p]]) {
                        enemy.hitboxes[junkBones[p]].snap_weight = -999999.0;
                        enemy.hitboxes[junkBones[p]].priority = "IGNORE";
                    }
                }
            }

            // Quét mục tiêu ưu tiên thằng gần tâm ngắm nhất (FOV nhỏ nhất)
            if (fov2D < lowestFov) {
                lowestFov = fov2D;
                bestTarget = enemy;
                bestTarget.distance = distance3D;
                bestTarget.fov2D = fov2D; 
            }
        }

        // ====================================================================
        // [GIẢI QUYẾT BÀI TOÁN 2]: PARABOLIC GRAVITY & KALMAN JIGGLE PREDICTION
        // ====================================================================
        const targetState = state.target;

        if (bestTarget) {
            if (targetState.id !== bestTarget.id) this.flushTrackerState(bestTarget.id);

            targetState.id = bestTarget.id;
            targetState.distance = bestTarget.distance;
            targetState.currentFov2D = bestTarget.fov2D;

            // PHÂN TÁCH TỌA ĐỘ: ĐẦU (Cho Magic Bullet) & NGỰC (Cho Silent Aim Camera)
            let headPos = { ...bestTarget.pos };
            let silentAimPos = { ...bestTarget.pos };

            if (bestTarget.hitboxes) {
                if (bestTarget.hitboxes.head?.pos) {
                    headPos = bestTarget.hitboxes.head.pos;
                    targetState.currentBoneHash = boneMap.HEAD;
                } else if (bestTarget.hitboxes.neck?.pos) {
                    headPos = bestTarget.hitboxes.neck.pos;
                    targetState.currentBoneHash = boneMap.NECK;
                }

                if (bestTarget.hitboxes.spine1?.pos) silentAimPos = bestTarget.hitboxes.spine1.pos;
                else if (bestTarget.hitboxes.spine?.pos) silentAimPos = bestTarget.hitboxes.spine.pos;
                else silentAimPos = headPos; // Fallback
            }

            targetState.pos = { ...headPos };
            
            let trackData = state.tracker[bestTarget.id];
            trackData.history.unshift({ pos: { ...headPos }, silentPos: { ...silentAimPos }, time: currentTime });
            if (trackData.history.length > 5) trackData.history.pop(); // Giữ lịch sử cực ngắn để triệt tiêu đà cũ

            let prevFrame = trackData.history[1] || trackData.history[0];
            let dt = Math.min(Math.max((currentTime - prevFrame.time) / 1000.0, 0.001), 0.033);

            let raw_vx = (headPos.x - prevFrame.pos.x) / dt;
            let raw_vy = (headPos.y - prevFrame.pos.y) / dt;
            let raw_vz = (headPos.z - prevFrame.pos.z) / dt;
            
            // THUẬT TOÁN KALMAN 2D: Phá giải Jiggle Peek (Lách trái phải liên tục)
            // Nếu phát hiện đổi hướng đột ngột (Vận tốc X hoặc Z đảo dấu), lập tức tin tưởng 98% vào vận tốc mới
            let signX_old = Math.sign(trackData.velocity.x);
            let signX_new = Math.sign(raw_vx);
            let signZ_old = Math.sign(trackData.velocity.z);
            let signZ_new = Math.sign(raw_vz);
            
            let alphaX = (signX_old !== signX_new && Math.abs(raw_vx) > 1.5) ? 0.98 : 0.75;
            let alphaZ = (signZ_old !== signZ_new && Math.abs(raw_vz) > 1.5) ? 0.98 : 0.75;

            trackData.velocity.x = (raw_vx * alphaX) + (trackData.velocity.x * (1 - alphaX));
            trackData.velocity.y = (raw_vy * 0.85) + (trackData.velocity.y * 0.15);
            trackData.velocity.z = (raw_vz * alphaZ) + (trackData.velocity.z * (1 - alphaZ));

            targetState.velocity = { ...trackData.velocity };

            let t = this.PREDICTION_TIME;
            
            // ====================================================================
            // ĐỘNG HỌC PARABOL: QUYẾT ĐOÁN BẮN HẠ KẺ ĐỊCH TRÊN KHÔNG
            // ====================================================================
            let predY = headPos.y;
            let silentPredY = silentAimPos.y;
            
            // Nếu kẻ địch đang di chuyển trục dọc (nhảy lên hoặc rơi xuống) vượt ngưỡng
            if (Math.abs(trackData.velocity.y) > 0.8) {
                // Áp dụng công thức Newton: Y = Y0 + v*t - 0.5*g*t^2
                let gravityDrop = 0.5 * this.GAME_GRAVITY * (t * t);
                predY = headPos.y + (trackData.velocity.y * t) - gravityDrop;
                silentPredY = silentAimPos.y + (trackData.velocity.y * t) - gravityDrop;
            }

            // Tọa độ Đầu tuyệt đối (Cấp cho Magic Bullet M8 để ghi đè tia Raycast)
            targetState.predicted_pos = { 
                x: headPos.x + trackData.velocity.x * t, 
                y: predY, 
                z: headPos.z + trackData.velocity.z * t 
            };

            // Tọa độ Ngực ngụy trang (Cấp cho Camera M7 để xoay không bị lộ)
            let svx = (silentAimPos.x - prevFrame.silentPos.x) / dt;
            let svz = (silentAimPos.z - prevFrame.silentPos.z) / dt;
            targetState.silent_predicted_pos = {
                x: silentAimPos.x + svx * t,
                y: silentPredY, 
                z: silentAimPos.z + svz * t
            };
        } else {
            targetState.id = null; targetState.predicted_pos = null; targetState.silent_predicted_pos = null;
        }

        return payload;
    }
}

// ============================================================================
// MODULE 7: CAMERA MANIPULATOR V15.5 – ULTIMATE SILENT AIM & RECOIL OVERRIDE
// Nhiệm vụ: Tước quyền cảm ứng (Input Ignorance), Phân định Silent Aim (Ngực) 
//           hoặc Rage Snap (Đầu), Triệt tiêu độ giật và Xóa ma sát Camera.
// ============================================================================
class CameraManipulator {
    
    static normalizeAngle(angle) {
        while (angle > 180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }

    static execute(payload) {
        const state = _global.__OmniState;
        const targetState = state.target;
        const weaponState = state.weapon;
        const camState = state.camera;

        // Nếu không bấm bắn hoặc mất mục tiêu -> Trả lại quyền điều khiển cho người chơi
        if (!targetState.id || !weaponState.isFiring || !targetState.predicted_pos) {
            return payload;
        }

        // ==========================================================
        // 1. INPUT IGNORANCE (TƯỚC QUYỀN VUỐT MÀN HÌNH TẠM THỜI)
        // ==========================================================
        // Giải quyết Bài toán 1: Khi bạn lỡ tay kéo tâm xuống đất/bụng,
        // Game Engine sẽ cộng lực kéo đó vào Camera. Ta phải vô hiệu hóa nó ngay!
        if (payload.touch_delta) payload.touch_delta = { x: 0, y: 0 };
        if (payload.input_drag) payload.input_drag = { x: 0, y: 0 };
        if (payload.joystick_delta) payload.joystick_delta = { x: 0, y: 0 }; // Chặn nốt Joystick nếu có
        
        let currentPitch = payload.camera ? payload.camera.pitch : (payload.aim_pitch || 0);
        let currentYaw = payload.camera ? payload.camera.yaw : (payload.aim_yaw || 0);

        let origin = payload.fire_origin || state.self.anchorPos;
        
        // ==========================================================
        // 2. PHÂN ĐỊNH CHẾ ĐỘ SILENT AIM HAY RAGE SNAP
        // ==========================================================
        // FOV 2D > 12 độ (địch lệch mép màn hình) HOẶC Khoảng cách < 6m (Siêu gần)
        // -> Kích hoạt Silent Aim: Camera giật vào NGỰC để chống chóng mặt & Anti-Cheat.
        // Đạn sẽ do Magic Bullet bẻ cong 45 độ lên đầu.
        const useSilentAim = targetState.currentFov2D > 12.0 || targetState.distance < 6.0;
        
        // Lấy tọa độ đích đã được bù trừ Trọng lực Parabol và Lách ngang từ Module 4
        let dest = (useSilentAim && targetState.silent_predicted_pos) 
                   ? targetState.silent_predicted_pos // Tọa độ Ngực + Parabol
                   : targetState.predicted_pos;       // Tọa độ Đầu + Parabol

        let dx = dest.x - origin.x;
        let dy = dest.y - origin.y;
        let dz = dest.z - origin.z;
        let distXZ = Math.sqrt(dx * dx + dz * dz) || 0.0001;

        // Tính góc xoay Camera (Euler Angles)
        let targetYaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
        let targetPitch = -Math.atan2(dy, distXZ) * (180.0 / Math.PI); 

        // ==========================================================
        // 3. EULER RECOIL NULLIFICATION (BÙ TRỪ ĐỘ GIẬT TRỰC TIẾP)
        // ==========================================================
        let recoilY = 0.0;
        let recoilX = 0.0;
        
        if (payload.weapon) {
            recoilY = payload.weapon.recoil_y || payload.weapon.recoil_accumulation || 0.0;
            recoilX = payload.weapon.recoil_x || 0.0;
        }

        // Khai tử EMA - Dịch chuyển tức thời (Hard-Snap) & Trừ thẳng độ giật
        let nextPitch = targetPitch - recoilY;
        let nextYaw = targetYaw - recoilX;

        let errorPitch = this.normalizeAngle(nextPitch - currentPitch);
        let errorYaw = this.normalizeAngle(nextYaw - currentYaw);

        // ==========================================================
        // 4. ABSOLUTE ZERO DEADZONE (KHÓA TĨNH CHỐNG RUNG JITTER)
        // ==========================================================
        // Tránh camera bị giật khung hình do sai số dấu phẩy động
        if (Math.abs(errorPitch) < 0.05) nextPitch = camState.lastPitch || nextPitch; 
        if (Math.abs(errorYaw) < 0.05) nextYaw = camState.prevYaw || nextYaw;

        camState.lastPitch = nextPitch;
        camState.prevYaw = nextYaw;
        
        // Cập nhật gói tin Camera
        if (payload.camera) {
            payload.camera.pitch = nextPitch;
            payload.camera.yaw = nextYaw;
        } else {
            payload.aim_pitch = nextPitch;
            payload.aim_yaw = nextYaw;
        }

        // ==========================================================
        // 5. CONSTRAINT OVERRIDE (PHÁ VỠ GIỚI HẠN VẬT LÝ ENGINE)
        // ==========================================================
        if (payload.camera_constraints) {
            payload.camera_constraints.max_pitch_speed = 99999.0;
            payload.camera_constraints.max_yaw_speed = 99999.0;
            payload.camera_constraints.friction = 0.0;
            payload.camera_constraints.damping = 0.0;
            payload.camera_constraints.snap_resistance = 0.0; // Phá vỡ sức cản ngắm
        }

        return payload;
    }
}

// ============================================================================
// MODULE 5: SELF KINEMATICS V14.8 – RAGE ROOTING & VELOCITY SPOOFING
// Nhiệm vụ: Đóng cọc vị trí (Anchor Lock), Xóa sạch vận tốc truyền lên Server,
//           Kê nòng sát mặt địch (CQC Face-hugging) để chống méo đường đạn.
// ============================================================================
class SelfKinematics {
    
    static execute(payload) {
        const state = _global.__OmniState.self;
        const targetState = _global.__OmniState.target;
        const weaponState = _global.__OmniState.weapon;

        const isFiring = weaponState.isFiring || weaponState.triggerFired || payload.is_firing || false;

        if (!state.lastAnchor) state.lastAnchor = null;

        // ====================================================================
        // 1. GHI NHẬN VỊ TRÍ KHI KHÔNG BẮN (FREE MOVEMENT)
        // ====================================================================
        if (!isFiring) {
            if (payload.anchorPos !== undefined) {
                state.lastAnchor = { ...payload.anchorPos };
            }
            return payload; // Trả lại quyền di chuyển vật lý bình thường
        }

        // ====================================================================
        // 2. ROOTING (ĐÓNG CỌC VỊ TRÍ KHI BẮN)
        // ====================================================================
        // Ép tọa độ bản thân về điểm neo cuối cùng ngay trước khi bấm cò.
        // Ngăn chặn Server cộng thêm đà di chuyển của bạn vào đường đạn.
        if (payload.anchorPos !== undefined && state.lastAnchor) {
            payload.anchorPos.x = state.lastAnchor.x;
            payload.anchorPos.y = state.lastAnchor.y;
            payload.anchorPos.z = state.lastAnchor.z;
        }

        // ====================================================================
        // 3. ZERO-VELOCITY SPOOFING (LỪA ĐẢO TRẠNG THÁI SERVER)
        // ====================================================================
        // Ép game engine tin rằng bạn đang Đứng Im (Stance 0) và Không có gia tốc.
        // Điều này kích hoạt độ chụm đạn (Accuracy) tuyệt đối của engine súng.
        if (payload.velocity !== undefined) {
            payload.velocity = { x: 0.0, y: 0.0, z: 0.0 };
        }
        if (payload.acceleration !== undefined) {
            payload.acceleration = { x: 0.0, y: 0.0, z: 0.0 };
        }
        if (payload.speed !== undefined) payload.speed = 0.0;
        if (payload.is_moving !== undefined) payload.is_moving = false;
        if (payload.stance !== undefined) payload.stance = 0;

        // ====================================================================
        // 4. CQC FACE-HUGGING & DYNAMIC FIRE ORIGIN
        // ====================================================================
        // Ghi đè điểm xuất phát của viên đạn (Fire Origin)
        if (payload.fire_origin !== undefined && targetState.predicted_pos) {
            if (targetState.distance < 3.5) {
                // [Tầm siêu gần < 3.5m]: Kê thẳng nòng súng vào mặt địch (Z - 0.02)
                // Phá vỡ hoàn toàn góc mù Camera và méo FOV khi địch áp sát
                payload.fire_origin = {
                    x: targetState.predicted_pos.x,
                    y: targetState.predicted_pos.y,
                    z: targetState.predicted_pos.z - 0.02
                };
            } else if (state.lastAnchor) {
                // [Tầm Trung/Xa]: Nâng điểm bắn lên ngang cổ mình để không bị vướng vật cản dưới đất
                payload.fire_origin = {
                    x: state.lastAnchor.x,
                    y: state.lastAnchor.y + 1.68,
                    z: state.lastAnchor.z
                };
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 6.5: TRIGGER CHECK V14.8 – RAGE PRE-FIRE AI & CHARGE HACK
// Nhiệm vụ: Tự động cướp cò bạo lực (Aggressive Auto-fire), Hack Max Sạc súng,
//           Kích hoạt cờ Khóa Cứng Tuyệt Đối (Absolute Snap) tức thời.
// ============================================================================
class TriggerCheck {
    
    static execute(payload) {
        const state = _global.__OmniState;
        const targetState = state.target;
        const weaponState = state.weapon;
        const profile = state.weaponProfile;

        // Reset tín hiệu của khung hình (Frame) trước
        weaponState.triggerFired = false;
        weaponState.forceAbsoluteSnap = false;

        if (profile.Core === "IGNORE") return payload;

        // Đọc tín hiệu bấm bắn thủ công từ người chơi
        let isManualFiring = payload.is_firing || (payload.weapon && payload.weapon.is_firing) || false;

        // Trả lại trạng thái bình thường nếu không có mục tiêu
        if (!targetState.id || !targetState.predicted_pos) {
            return payload;
        }

        // ==========================================================
        // 1. RAGE AUTO-FIRE AI (TRÍ TUỆ TIỀN HỎA TÀN BẠO)
        // ==========================================================
        let shouldAutoFire = false;
        const distance = targetState.distance || 99999;
        
        // Kiểm tra xem địch có nấp sau vật cản cứng không (Dựa vào engine game)
        // Lưu ý: Nếu có bản Mod xuyên tường (Wallhack), biến này luôn là false.
        const isCovered = (state.tracker[targetState.id] && state.tracker[targetState.id].is_behind_cover) || false;

        if (!isCovered) {
            // A. Tỉa Sniper/OneTap Tức Thời: Thấy 1 pixel là tự động nhả đạn
            if (profile.Core === "ONETAP" && distance < 250) {
                shouldAutoFire = true;
            }
            
            // B. Sấy Shotgun CQC: Địch lọt vào vòng tròn 15m là nổ súng
            if (profile.Core === "SHOTGUN" && distance <= 15.5) {
                shouldAutoFire = true;
            }

            // C. Sấy AR/SMG: Chỉ tự bắn khi địch ở cự ly vừa và gần (tránh lãng phí đạn)
            if (profile.Core === "AUTO" && distance <= 120) {
                shouldAutoFire = true;
            }
        }

        // ==========================================================
        // 2. EXECUTION & CHARGE-SHOT HACK (KÍCH HOẠT VÀ HACK TÍCH LỰC)
        // ==========================================================
        const shouldFire = isManualFiring || shouldAutoFire;

        if (shouldFire) {
            // Ép tín hiệu bắn cho Game Engine
            payload.is_firing = true;
            
            if (payload.weapon) {
                payload.weapon.is_firing = true;
                
                // [HACK TÍCH LỰC]: Ép Charge Buster / CG15 luôn ở trạng thái 100% Sạc
                // Đạn bắn ra lập tức đạt sát thương max mà không cần đè nút
                if (payload.weapon.charge_time !== undefined) {
                    payload.weapon.charge_time = 99999.0;
                }
                if (payload.weapon.charge_level !== undefined) {
                    payload.weapon.charge_level = 99999.0;
                }
            }

            // Ghi nhận trạng thái vào Global State để các module khác (M7, M5) biết
            weaponState.isFiring = true;
            weaponState.triggerFired = true;

            // BẬT CỜ DỊCH CHUYỂN VÀ BẺ ĐẠN NGAY LẬP TỨC (0ms delay)
            weaponState.forceAbsoluteSnap = true;
        } else {
            weaponState.isFiring = false;
        }

        return payload;
    }
}

// ============================================================================
// LÕI VŨ KHÍ RAGE: SHOTGUN, AUTO, ONETAP (ZERO-ALLOCATION LASER)
// Nhiệm vụ: Xóa sạch 100% độ giật, độ tản mát. Ép mọi viên đạn thành tia Laser.
// ============================================================================
class ShotgunCore {
    static execute(payload) {
        if (payload.weapon) {
            payload.weapon.recoil_y = 0.0; payload.weapon.recoil_x = 0.0; payload.weapon.recoil_accumulation = 0.0;
            payload.weapon.base_spread = 0.0; payload.weapon.dynamic_spread = 0.0; payload.weapon.max_spread = 0.0;
            payload.weapon.spread_add_per_shot = 0.0; payload.weapon.inaccuracy_move = 0.0;
        }
        // Để MagicBullet lo phần dẫn hướng tia đạn
        return payload;
    }
}

class AutoCore {
    static execute(payload) {
        if (payload.weapon) {
            payload.weapon.recoil_y = 0.0; payload.weapon.recoil_x = 0.0; payload.weapon.recoil_accumulation = 0.0;
            payload.weapon.base_spread = 0.0; payload.weapon.dynamic_spread = 0.0; payload.weapon.spread_add_per_shot = 0.0;
            payload.weapon.inaccuracy_move = 0.0; payload.weapon.inaccuracy_jump = 0.0;
        }
        return payload;
    }
}

class OneTapCore {
    static execute(payload) {
        if (payload.weapon) {
            payload.weapon.recoil_y = 0.0; payload.weapon.recoil_x = 0.0;
            payload.weapon.base_spread = 0.0; payload.weapon.dynamic_spread = 0.0;
            payload.weapon.recoil_recovery = 99999.0; // Hồi tâm tức thời sau 1 viên đạn
            payload.weapon.inaccuracy_move = 0.0; payload.weapon.inaccuracy_jump = 0.0;
        }
        return payload;
    }
}

// ============================================================================
// MODULE 8: MAGIC BULLET CORE V15.0 – PING BACKTRACKING & GHOST PENETRATION
// Nhiệm vụ: Xuyên thủng mọi vật cản, Bẻ cong tia đạn, và Lùi thời gian Server
//           để bắn trúng cái bóng trong quá khứ của địch khi lách ngang.
// ============================================================================
class MagicBulletCore {
    static execute(payload) {
        const state = _global.__OmniState;
        const targetState = state.target;
        const weaponState = state.weapon;

        if (!targetState || !targetState.id || !targetState.predicted_pos || !weaponState.isFiring) {
            return payload;
        }

        if (payload.miss_event || (payload.bullet_event && payload.bullet_event.is_hit === false)) {
            if (payload.miss_event) {
                payload.hit_event = payload.miss_event; 
                delete payload.miss_event;
            }
            if (payload.bullet_event) payload.bullet_event.is_hit = true;
            if (!payload.hit_event) payload.hit_event = {};
            payload.hit_event.target_id = targetState.id;
        }

        if (payload.players) {
            for (let i = 0; i < payload.players.length; i++) {
                let enemy = payload.players[i];
                if (enemy.id !== targetState.id && enemy.hitboxes) {
                    ['head', 'chest', 'pelvis', 'legs', 'arms', 'neck'].forEach(part => {
                        if (enemy.hitboxes[part]) enemy.hitboxes[part].radius = 0.001; 
                    });
                }
            }
        }

        let origin = payload.fire_origin || state.self.lastAnchor || state.self.anchorPos;
        
        if (origin && targetState.predicted_pos) {
            let dx = targetState.predicted_pos.x - origin.x;
            let dy = targetState.predicted_pos.y - origin.y;
            let dz = targetState.predicted_pos.z - origin.z;

            const mag = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1.0;
            let rawDirX = dx/mag, rawDirY = dy/mag, rawDirZ = dz/mag;

            // ==========================================================
            // [SIÊU NÂNG CẤP]: SERVER BACKTRACKING (THAO TÚNG THỜI GIAN)
            // ==========================================================
            // Trừ đi 35 mili-giây (tương đương bù trừ cho mức Ping 35-50ms)
            // Khi địch lách qua vật cản, ta bắn vào cái bóng của nó 35ms trước,
            // Server sẽ tính toán lại và xác nhận trúng đạn dù địch đã núp xong!
            const BACKTRACK_MS = 35; 

            if (payload.bullet_events) {
                for (let i = 0; i < payload.bullet_events.length; i++) {
                    let bullet = payload.bullet_events[i];
                    if (!bullet.ray_dir) bullet.ray_dir = {};
                    
                    bullet.ray_dir.x = rawDirX; bullet.ray_dir.y = rawDirY; bullet.ray_dir.z = rawDirZ;
                    bullet.target_id = targetState.id;
                    
                    bullet.spread_angle = 0.0; bullet.deviation = 0.0; bullet.angular_velocity = 0.0;
                    bullet.is_penetrating = true; bullet.collision_obstacle = false;

                    // Thao túng Timestamp của viên đạn
                    if (bullet.timestamp) bullet.timestamp -= BACKTRACK_MS;
                    if (bullet.server_time) bullet.server_time -= BACKTRACK_MS;
                    if (bullet.tick_count) bullet.tick_count -= 2; // Lùi 2 ticks
                }
            }

            if (payload.damage_report || payload.hit_event) {
                let report = payload.damage_report || payload.hit_event;
                report.target_id = targetState.id;
                
                report.hit_bone = targetState.currentBoneHash || state.boneMap.HEAD; 
                report.is_headshot = true;
                
                if (!report.hit_pos) report.hit_pos = {};
                report.hit_pos.x = targetState.predicted_pos.x;
                report.hit_pos.y = targetState.predicted_pos.y;
                report.hit_pos.z = targetState.predicted_pos.z;

                if (report.ray_dir) {
                    report.ray_dir.x = rawDirX; report.ray_dir.y = rawDirY; report.ray_dir.z = rawDirZ;
                }

                report.distance_penalty = 0.0; report.armor_penetration = 1.0; report.ignore_armor = true; 
                if (report.damage_multiplier !== undefined) report.damage_multiplier = 1.35;

                // Thao túng Timestamp của báo cáo sát thương
                if (report.timestamp) report.timestamp -= BACKTRACK_MS;
            }
        }

        return payload;
    }
}

// ============================================================================
// BỘ ĐIỀU PHỐI TỔNG (MATRIX DISPATCHER V2.8 - ZERO STUTTER)
// Nhiệm vụ: Đệ quy an toàn, tiệt trùng không rác (Zero-GC), Lưới lọc Siêu Tốc
// ============================================================================
class MatrixDispatcher {
    
    // Tiệt trùng không xả rác bộ nhớ (Zero-GC Sanitizer)
    sanitizeTelemetry(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        if (obj.eventName || obj.cmd || obj.type) {
            const str = JSON.stringify(obj).toLowerCase();
            if (str.includes('report') || str.includes('hackkill') || str.includes('telemetry')) {
                return {}; 
            }
        }
        return obj;
    }

    processPayload(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        // Đệ quy sâu (Deep Search)
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

        // LƯỚI LỌC SIÊU TỐC (FAST BYPASS GATE): Khắc phục lỗi khựng khi xoay màn hình
        const hasActionableData = payload.players || payload.weapon || payload.bullet_events || payload.damage_report || payload.camera || payload.aim_pitch !== undefined;
        if (!hasActionableData) return payload; 

        // Thực thi lõi
        payload = this.sanitizeTelemetry(payload);
        payload = WeaponClassifier.execute(payload);

        // --- CÁC MODULE RAGE SẼ ĐƯỢC CHÈN VÀO ĐÂY ---
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
// NATIVE ENGINE WRAPPER (APP / SHORTCUT HOOK)
// ============================================================================
if (!_global.__OMNI_ENGINE) {
    _global.__OMNI_ENGINE = new MatrixDispatcher();
}

function ProcessPayload(inputPayload) {
    try {
        let isString = typeof inputPayload === 'string';
        let payload = isString ? JSON.parse(inputPayload) : inputPayload;
        
        const mutated = _global.__OMNI_ENGINE.processPayload(payload);
        
        return isString ? JSON.stringify(mutated) : mutated;
    } catch (e) {
        return inputPayload;
    }
}

// Đã loại bỏ UpdateConfig (K_burst) vì bản RAGE khóa cứng không cần tinh chỉnh lực
const OMNI_API = {
    ProcessPayload: ProcessPayload,
    Version: "MATRIX_V2.5_RAGE"
};

if (typeof window !== 'undefined') window.OMNI_MATRIX = OMNI_API;
else if (typeof globalThis !== 'undefined') globalThis.OMNI_MATRIX = OMNI_API;
else _global.OMNI_MATRIX = OMNI_API;

if (typeof module !== 'undefined') module.exports = OMNI_API;
