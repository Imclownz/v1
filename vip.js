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
// MODULE 4: TARGET KINEMATICS V7.8 – RAGE HARD-LOCK CORE
// Nhiệm vụ: Quét lọc mục tiêu tối ưu, Thiết lập Hard-Snap Weight theo Bone Map,
//           Dự đoán Tuyến tính (Linear), Kẹp DeltaTime và Xả lịch sử tức thì.
// ============================================================================
class TargetKinematics {
    
    static normalizeAngle(angle) {
        while (angle > 180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }

    // [CƠ CHẾ RAGE 1]: XẢ TRẮNG BỘ NHỚ LẬP TỨC (STATE FLUSHING) CHỐNG LỆCH TÂM KHI ĐỔI MỤC TIÊU
    static flushTrackerState(targetId) {
        _global.__OmniState.tracker[targetId] = {
            history: [],
            velocity: { x: 0, y: 0, z: 0 },
            lastVelocity: { x: 0, y: 0, z: 0 }
        };
    }

    static execute(payload) {
        const state = _global.__OmniState;
        const selfState = state.self;
        const weaponState = state.weapon;
        const camState = state.camera;
        const boneMap = state.boneMap;

        // 1. ĐỒNG BỘ ĐỘNG HỌC TUYỆT ĐỐI CỦA BẢN THÂN
        if (payload.anchorPos !== undefined) {
            selfState.anchorPos = { ...payload.anchorPos };
        }
        if (payload.velocity !== undefined) {
            selfState.vel = { ...payload.velocity };
        }

        // Tước quyền kiểm soát của Aim-Assist mặc định từ Game Engine
        if (payload.aim_assist !== undefined) {
            payload.aim_assist.friction = 0.0;
            payload.aim_assist.adhesion = 0.0;
            payload.aim_assist.snap_weight = -99999.0;
        }

        if (!payload || !payload.players || !Array.isArray(payload.players)) return payload;
        if (!selfState.anchorPos || selfState.anchorPos.x === 0) return payload;

        const isFiring = weaponState.isFiring || weaponState.triggerFired || payload.is_firing || false;
        const currentTime = Date.now();
        
        // Cơ chế Throttle kiểm soát bão gói tin khi chỉ xoay màn hình (Panning)
        if (!isFiring) {
            if (currentTime - camState.lastKineTime < 16) {
                return payload; 
            }
            camState.lastKineTime = currentTime;
        }

        const currentYaw = payload.aim_yaw !== undefined ? payload.aim_yaw : (camState.prevYaw || 0.0);
        if (payload.aim_yaw !== undefined) camState.prevYaw = payload.aim_yaw;

        let bestTarget = null;
        let lowestThreatScore = 99999.0;

        // ====================================================================
        // 2. ÉP XUNG TRỌNG SỐ THEO HIERARCHY XƯƠNG & TRIỆT TIÊU THÂN DƯỚI (2.JSON)
        // ====================================================================
        for (let i = 0; i < payload.players.length; i++) {
            const enemy = payload.players[i];

            if (enemy.hitboxes) {
                // TRIẾT LÝ RAGE: Khóa cứng trọng số cực đại vào đầu, bỏ qua bộ đếm thời gian
                if (enemy.hitboxes.head) {
                    enemy.hitboxes.head.snap_weight = 999999.0;
                    enemy.hitboxes.head.friction = 1.0;
                    enemy.hitboxes.head.priority = "HIGHEST";
                    enemy.hitboxes.head._boneHash = boneMap.HEAD;
                }
                // Khởi tạo các điểm xương dự phòng (Fallback) nếu Đầu bị che khuất
                if (enemy.hitboxes.neck) {
                    enemy.hitboxes.neck.snap_weight = 9999.0; 
                    enemy.hitboxes.neck.friction = 0.3;
                    enemy.hitboxes.neck._boneHash = boneMap.NECK;
                }
                if (enemy.hitboxes.spine1) {
                    enemy.hitboxes.spine1.snap_weight = 500.0; 
                    enemy.hitboxes.spine1._boneHash = boneMap.SPINE1;
                }

                // KHAI TỬ HOÀN TOÀN TỨ CHI VÀ XƯƠNG GIẢ (DECOY DUMMY BONES)
                const junkBones = [
                    'chest', 'spine', 'pelvis', 'legs', 'arms', 
                    'left_arm', 'right_arm', 'left_leg', 'right_leg',
                    'hand', 'finger', 'bone_Hips_Dummy'
                ];
                for (let p = 0; p < junkBones.length; p++) {
                    if (enemy.hitboxes[junkBones[p]]) {
                        enemy.hitboxes[junkBones[p]].snap_weight = -999999.0;
                        enemy.hitboxes[junkBones[p]].friction = 0.0;
                        enemy.hitboxes[junkBones[p]].priority = "IGNORE";
                    }
                }
            }

            // ĐÁNH GIÁ ĐIỂM ĐE DỌA (RAGE SCORING - ƯU TIÊN FOV GẦN TÂM NHẤT)
            if (enemy.is_dead || enemy.hp <= 0 || enemy.is_knocked || !enemy.pos) continue;
            if (enemy.team_id !== undefined && enemy.team_id === state.team_id) continue;

            const dx = enemy.pos.x - selfState.anchorPos.x;
            const dy = enemy.pos.y - selfState.anchorPos.y;
            const dz = enemy.pos.z - selfState.anchorPos.z;
            const distance3D = Math.sqrt(dx*dx + dy*dy + dz*dz);

            if (distance3D > 280.0) continue; 

            let angleToEnemy = Math.atan2(dx, dz) * (180.0 / Math.PI);
            let fovDiff = Math.abs(this.normalizeAngle(angleToEnemy - currentYaw));
            
            // Ép hệ số phạt FOV lên cao để khóa cứng mục tiêu trong tầm nhìn, tránh đổi mục tiêu hỗn loạn
            let threatScore = fovDiff * 6.5 + distance3D * 0.3;

            if (threatScore < lowestThreatScore) {
                lowestThreatScore = threatScore;
                bestTarget = enemy;
                bestTarget.distance = distance3D;
            }
        }

        // ====================================================================
        // 3. THUẬT TOÁN DỰ ĐOÁN TUYẾN TÍNH TRƠN (ZERO-INERTIA LINEAR PREDICTION)
        // ====================================================================
        const targetState = state.target;
        const tracker = state.tracker;

        if (bestTarget) {
            // ĐỔI MỤC TIÊU KHẨN CẤP -> KÍCH HOẠT FLUSH STATE XÓA QUÁN TÍNH CŨ
            if (targetState.id !== bestTarget.id) {
                this.flushTrackerState(bestTarget.id);
            }

            targetState.id = bestTarget.id;
            targetState.distance = bestTarget.distance;

            // Cơ chế Khóa Đa Tầng (Multi-Bone Scan): Ưu tiên ngắm tọa độ từ cao xuống thấp
            let optimalHitboxPos = null;
            if (bestTarget.hitboxes) {
                if (bestTarget.hitboxes.head?.pos) {
                    optimalHitboxPos = bestTarget.hitboxes.head.pos;
                    targetState.currentBoneHash = boneMap.HEAD;
                } else if (bestTarget.hitboxes.neck?.pos) {
                    optimalHitboxPos = bestTarget.hitboxes.neck.pos;
                    targetState.currentBoneHash = boneMap.NECK;
                } else if (bestTarget.hitboxes.spine1?.pos) {
                    optimalHitboxPos = bestTarget.hitboxes.spine1.pos;
                    targetState.currentBoneHash = boneMap.SPINE1;
                }
            }

            // Phương án dự phòng nếu gói tin của mục tiêu bị khuyết mảng hitboxes
            if (!optimalHitboxPos) {
                optimalHitboxPos = { x: bestTarget.pos.x, y: bestTarget.pos.y + 1.54, z: bestTarget.pos.z };
                targetState.currentBoneHash = boneMap.HEAD;
            }

            targetState.pos = { ...optimalHitboxPos };

            let trackData = tracker[bestTarget.id];
            if (!trackData) {
                this.flushTrackerState(bestTarget.id);
                trackData = tracker[bestTarget.id];
            }

            trackData.history.unshift({ pos: { ...optimalHitboxPos }, time: currentTime });
            if (trackData.history.length > 8) trackData.history.pop(); // Giới hạn bộ đệm ngắn (8) để triệt tiêu đà quán tính cũ

            let prevFrame = trackData.history[1] || trackData.history[0];
            let dt = (currentTime - prevFrame.time) / 1000.0;

            // [CƠ CHẾ RAGE 2]: KẸP CHẶT THỜI GIAN DELTATIME CHỐNG ĐỘT BIẾN GIA TỐC ẢO
            if (dt > 0.0) {
                dt = Math.min(Math.max(dt, 0.001), 0.033); // Khóa trần dt ở 33ms (tương đương cấu trúc 30 FPS tối thiểu)

                // Tính toán vector vận tốc thuần túy
                let raw_vx = (optimalHitboxPos.x - prevFrame.pos.x) / dt;
                let raw_vy = (optimalHitboxPos.y - prevFrame.pos.y) / dt;
                let raw_vz = (optimalHitboxPos.z - prevFrame.pos.z) / dt;

                // Tăng tốc độ lọc EMA để bắt kịp 100% mọi pha đổi hướng tức thời (Jiggle Peek)
                let alphaV = 0.85; 
                trackData.velocity.x = (raw_vx * alphaV) + (trackData.velocity.x * (1 - alphaV));
                trackData.velocity.y = (raw_vy * alphaV) + (trackData.velocity.y * (1 - alphaV));
                trackData.velocity.z = (raw_vz * alphaV) + (trackData.velocity.z * (1 - alphaV));

                targetState.velocity = { ...trackData.velocity };

                // [CƠ CHẾ RAGE 3]: ĐOẠN TUYỆT VỚI J_ACCEL VÀ JERK - CHỈ DÙNG BẬC 1 TUYẾN TÍNH
                // Thời gian bù trễ lý tưởng cho cơ chế đạn hitscan được tinh chỉnh ở mốc 48ms
                let timeToTarget = 0.048; 

                let predX = optimalHitboxPos.x + (trackData.velocity.x * timeToTarget);
                let predZ = optimalHitboxPos.z + (trackData.velocity.z * timeToTarget);
                
                // KHÓA CHẶT DỰ ĐOÁN TRỤC Y (VERTICAL PREDICTION NULLIFICATION)
                // Ép điểm ngắm không nảy vọt quá đỉnh đầu khi đối phương chạy hoặc nhảy lên
                let predY = optimalHitboxPos.y; 
                
                // Chỉ kích hoạt bù trừ trục dọc duy nhất khi phát hiện địch đang rơi tự do ở gia tốc lớn (vy < -3.0 m/s)
                if (trackData.velocity.y < -3.0) {
                    predY += (trackData.velocity.y * timeToTarget);
                }

                targetState.predicted_pos = { x: predX, y: predY, z: predZ };
            } else {
                targetState.predicted_pos = { ...optimalHitboxPos };
                targetState.velocity = { x: 0, y: 0, z: 0 };
            }
        } else {
            // Không quét thấy ai -> Giải phóng bộ nhớ target
            targetState.id = null;
            targetState.pos = null;
            targetState.predicted_pos = null;
            targetState.currentBoneHash = null;
            targetState.velocity = { x: 0, y: 0, z: 0 };
        }

        return payload;
    }
}

// ============================================================================
// MODULE 7: CAMERA MANIPULATOR V14.8 – RAGE HARD-SNAP & RECOIL OVERRIDE
// Nhiệm vụ: Dịch ngược 3D sang Góc Euler, Dịch chuyển tức thời (Teleport),
//           Triệt tiêu hoàn toàn độ giật Camera, và Phá vỡ ma sát Engine.
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

        // Bỏ qua và trả lại quyền điều khiển nếu không bắn hoặc mất mục tiêu
        if (!targetState.id || !weaponState.isFiring || !targetState.predicted_pos) {
            return payload;
        }

        let currentPitch = payload.camera ? payload.camera.pitch : (payload.aim_pitch || 0);
        let currentYaw = payload.camera ? payload.camera.yaw : (payload.aim_yaw || 0);

        // ==========================================================
        // 1. TRIGONOMETRY ENGINE (DỊCH MÃ 3D XANG GÓC EULER CAMERA)
        // ==========================================================
        let origin = payload.fire_origin || state.self.anchorPos;
        let dest = targetState.predicted_pos;

        let dx = dest.x - origin.x;
        let dy = dest.y - origin.y;
        let dz = dest.z - origin.z;
        
        let distXZ = Math.sqrt(dx * dx + dz * dz);
        if (distXZ === 0) distXZ = 0.0001; // Chống lỗi chia cho 0

        // Tính góc mục tiêu tuyệt đối
        let targetYaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
        let targetPitch = -Math.atan2(dy, distXZ) * (180.0 / Math.PI); 

        // ==========================================================
        // 2. EULER RECOIL NULLIFICATION (BÙ TRỪ ĐỘ GIẬT TRỰC TIẾP)
        // ==========================================================
        // Game engine luôn cố hất Camera lên trên khi đạn nổ. Ta lấy thông số đó ra và trừ ngược lại!
        let recoilY = 0.0;
        let recoilX = 0.0;
        
        if (payload.weapon) {
            recoilY = payload.weapon.recoil_y || payload.weapon.recoil_accumulation || 0.0;
            recoilX = payload.weapon.recoil_x || 0.0;
        }

        // ==========================================================
        // 3. RAGE HARD-SNAP (DỊCH CHUYỂN TỨC THỜI - KHAI TỬ EMA)
        // ==========================================================
        // Không dùng hàm nội suy, không dùng lực búng. Ép thẳng tọa độ!
        let nextPitch = targetPitch - recoilY;
        let nextYaw = targetYaw - recoilX;

        let errorPitch = this.normalizeAngle(nextPitch - currentPitch);
        let errorYaw = this.normalizeAngle(nextYaw - currentYaw);

        // ==========================================================
        // 4. ABSOLUTE ZERO DEADZONE (KHÓA TĨNH CHỐNG JITTER)
        // ==========================================================
        // Nếu độ lệch chỉ là micro-pixel (dưới 0.05 độ), khóa cứng Camera.
        // Ngăn chặn việc dao động qua lại giữa Server và Script gây rung tâm.
        if (Math.abs(errorPitch) < 0.05) {
            nextPitch = camState.lastPitch || nextPitch; 
        }
        if (Math.abs(errorYaw) < 0.05) {
            nextYaw = camState.prevYaw || nextYaw;
        }

        camState.lastPitch = nextPitch;
        camState.prevYaw = nextYaw;
        
        // ==========================================================
        // 5. INJECTION & CONSTRAINT OVERRIDE (PHÁ VỠ GIỚI HẠN ENGINE)
        // ==========================================================
        if (payload.camera) {
            payload.camera.pitch = nextPitch;
            payload.camera.yaw = nextYaw;
        } else {
            payload.aim_pitch = nextPitch;
            payload.aim_yaw = nextYaw;
        }

        // Ép Game Engine bỏ qua mọi ma sát hoặc giới hạn tốc độ xoay Camera
        if (payload.camera_constraints) {
            payload.camera_constraints.max_pitch_speed = 99999.0;
            payload.camera_constraints.max_yaw_speed = 99999.0;
            payload.camera_constraints.friction = 0.0;
            payload.camera_constraints.damping = 0.0;
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
// MODULE 8: MAGIC BULLET CORE V14.8 – EXACT HASH OVERRIDE & GHOST PENETRATION
// Nhiệm vụ: Ghi đè tia Raycast, Ép sát thương vào đúng mã Bone Hash (2.json),
//           Xuyên thủng mọi vật cản và biến Trượt thành Trúng (100% Hitscan).
// ============================================================================
class MagicBulletCore {
    static execute(payload) {
        const state = _global.__OmniState;
        const targetState = state.target;
        const weaponState = state.weapon;

        // Nếu không có mục tiêu ngắm hoặc không kích hoạt bắn -> Bỏ qua
        if (!targetState || !targetState.id || !targetState.predicted_pos || !weaponState.isFiring) {
            return payload;
        }

        // ==========================================================
        // 1. MISS-TO-HIT INVERSION (BIẾN TRƯỢT THÀNH TRÚNG)
        // ==========================================================
        if (payload.miss_event || (payload.bullet_event && payload.bullet_event.is_hit === false)) {
            if (payload.miss_event) {
                payload.hit_event = payload.miss_event; // Chuyển con trỏ, không cấp phát thêm RAM
                delete payload.miss_event;
            }
            if (payload.bullet_event) payload.bullet_event.is_hit = true;
            if (!payload.hit_event) payload.hit_event = {};
            payload.hit_event.target_id = targetState.id;
        }

        // ==========================================================
        // 2. GHOST PENETRATION (XUYÊN THẤU VÀ TRÁNH OVERLAP)
        // ==========================================================
        // Thu nhỏ hitbox của các kẻ địch khác xung quanh để đạn lách qua, chỉ ghim vào Target
        if (payload.players) {
            for (let i = 0; i < payload.players.length; i++) {
                let enemy = payload.players[i];
                if (enemy.id !== targetState.id && enemy.hitboxes) {
                    ['head', 'chest', 'pelvis', 'legs', 'arms', 'neck'].forEach(part => {
                        if (enemy.hitboxes[part]) enemy.hitboxes[part].radius = 0.001; // Ép siêu nhỏ
                    });
                }
            }
        }

        // ==========================================================
        // 3. ABSOLUTE RAYCAST OVERRIDE (BẺ CONG TIA ĐẠN TỨC THỜI)
        // ==========================================================
        let origin = payload.fire_origin || state.self.lastAnchor || state.self.anchorPos;
        
        if (origin && targetState.predicted_pos) {
            let dx = targetState.predicted_pos.x - origin.x;
            let dy = targetState.predicted_pos.y - origin.y;
            let dz = targetState.predicted_pos.z - origin.z;

            // Toán học tính Vector hướng (Direction Vector)
            const mag = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1.0;
            let rawDirX = dx/mag, rawDirY = dy/mag, rawDirZ = dz/mag;

            // Áp tia đạn Laser vào TẤT CẢ các viên đạn (Bao gồm cả chùm đạn Shotgun)
            if (payload.bullet_events) {
                for (let i = 0; i < payload.bullet_events.length; i++) {
                    let bullet = payload.bullet_events[i];
                    if (!bullet.ray_dir) bullet.ray_dir = {};
                    
                    // Ép tia đạn đâm thẳng vào tọa độ đã định
                    bullet.ray_dir.x = rawDirX; 
                    bullet.ray_dir.y = rawDirY; 
                    bullet.ray_dir.z = rawDirZ;
                    
                    bullet.target_id = targetState.id;
                    bullet.spread_angle = 0.0; bullet.deviation = 0.0; bullet.angular_velocity = 0.0;
                    bullet.momentum_offset = 0.0; bullet.drift = 0.0; bullet.trajectory_curve = 0.0;
                    
                    // Bật cờ Xuyên Thấu (Wallbang/Penetration)
                    bullet.is_penetrating = true; 
                    bullet.collision_obstacle = false;
                }
            }

            // ==========================================================
            // 4. EXACT BONE HASH INJECTION (SÁT THƯƠNG TUYỆT ĐỐI)
            // ==========================================================
            if (payload.damage_report || payload.hit_event) {
                let report = payload.damage_report || payload.hit_event;
                report.target_id = targetState.id;
                
                // Lấy mã băm Hash chính xác từ Module 4 (Đã quét qua 2.json)
                // Mặc định ép về HEAD_HASH (-2111735698) nếu không tìm thấy
                report.hit_bone = targetState.currentBoneHash || state.boneMap.HEAD; 
                
                // Báo cáo Headshot bất chấp việc bắn vào đâu
                report.is_headshot = true;
                
                if (!report.hit_pos) report.hit_pos = {};
                report.hit_pos.x = targetState.predicted_pos.x;
                report.hit_pos.y = targetState.predicted_pos.y;
                report.hit_pos.z = targetState.predicted_pos.z;

                if (report.ray_dir) {
                    report.ray_dir.x = rawDirX; report.ray_dir.y = rawDirY; report.ray_dir.z = rawDirZ;
                }

                // Xóa bỏ mọi hệ số giảm sát thương do khoảng cách hoặc giáp
                report.distance_penalty = 0.0; 
                report.armor_penetration = 1.0; 
                report.ignore_armor = true; 
                
                // Hack x1.35 Damage cho mọi phát bắn
                if (report.damage_multiplier !== undefined) {
                    report.damage_multiplier = 1.35;
                }
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
