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
// MODULE 4: TARGET KINEMATICS V21.0 – HITBOX ANNIHILATION & BONE DELTA
// Nhiệm vụ: Xóa sổ 100% thể tích và ma sát của thân dưới, biến kẻ địch 
//           thành "Chỉ có Đầu". Tách biệt tọa độ Camera và Đạn.
// ============================================================================
class TargetKinematics {
    
    static ASPECT_RATIO = 1.77;       
    static MAX_HUMAN_SPEED = 8.5;     
    static HEAD_RADIUS = 0.16;        

    static normalizeAngle(angle) {
        while (angle > 180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }

    static flushTrackerState(targetId) {
        _global.__OmniState.tracker[targetId] = {
            history: [], velocity: { x: 0, y: 0, z: 0 }
        };
    }

    static execute(payload) {
        const state = _global.__OmniState;
        const selfState = state.self;
        const camState = state.camera;
        const boneMap = state.boneMap;

        if (payload.anchorPos !== undefined) selfState.anchorPos = { ...payload.anchorPos };
        if (payload.velocity !== undefined) selfState.vel = { ...payload.velocity };

        if (payload.aim_assist !== undefined) {
            payload.aim_assist.friction = 0.0; payload.aim_assist.adhesion = 0.0; payload.aim_assist.snap_weight = -99999.0;
        }

        if (!payload || !payload.players || !Array.isArray(payload.players)) return payload;
        if (!selfState.anchorPos || selfState.anchorPos.x === 0) return payload;

        const isFiring = state.weapon.isFiring || state.weapon.triggerFired || payload.is_firing || false;
        const currentTime = Date.now();
        
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
        // 1. DYNAMIC FOV & TOTAL HITBOX ANNIHILATION (KHAI TỬ THÂN DƯỚI)
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

            let dynamicFovLimit = distance3D < 3.5 ? 180.0 : (distance3D > 20.0 ? 12.0 : 45.0 - distance3D);

            let distXZ = Math.sqrt(dx*dx + dz*dz) || 0.001;
            let enemyYaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
            let enemyPitch = -Math.atan2(dy, distXZ) * (180.0 / Math.PI);

            let deltaYaw = Math.abs(this.normalizeAngle(enemyYaw - currentYaw));
            let deltaPitch = Math.abs(this.normalizeAngle(enemyPitch - currentPitch));
            let fov2D = Math.sqrt(Math.pow(deltaYaw / this.ASPECT_RATIO, 2) + Math.pow(deltaPitch, 2));

            if (fov2D > dynamicFovLimit) continue;

            // --- VŨ KHÍ TỐI THƯỢNG: XÓA SỔ THỂ TÍCH VẬT LÝ ---
            if (enemy.hitboxes) {
                const allBones = Object.keys(enemy.hitboxes);
                for (let b = 0; b < allBones.length; b++) {
                    let boneName = allBones[b].toLowerCase();
                    // Nếu không phải là Đầu hoặc Cổ -> Biến thành không khí
                    if (!boneName.includes('head') && !boneName.includes('neck')) {
                        enemy.hitboxes[allBones[b]].snap_weight = -999999.0;
                        enemy.hitboxes[allBones[b]].priority = "IGNORE";
                        enemy.hitboxes[allBones[b]].radius = 0.0001; // Bóp nát bán kính xương
                        enemy.hitboxes[allBones[b]].magnetism = 0.0; // Triệt tiêu nam châm hút
                        enemy.hitboxes[allBones[b]].adhesion = 0.0;
                        enemy.hitboxes[allBones[b]].friction = 0.0;  // Xóa ma sát làm chậm tâm
                    } else {
                        // Ép toàn bộ từ tính của Game tập trung vào sọ
                        enemy.hitboxes[allBones[b]].snap_weight = 999999.0;
                        enemy.hitboxes[allBones[b]].magnetism = 1.0; 
                    }
                }
            }

            if (fov2D < lowestFov) {
                lowestFov = fov2D;
                bestTarget = enemy;
                bestTarget.distance = distance3D;
                bestTarget.fov2D = fov2D; 
            }
        }

        const targetState = state.target;

        if (bestTarget) {
            if (targetState.id !== bestTarget.id) this.flushTrackerState(bestTarget.id);

            targetState.id = bestTarget.id;
            targetState.distance = bestTarget.distance;
            targetState.currentFov2D = bestTarget.fov2D;

            let headPos = { ...bestTarget.pos };
            if (bestTarget.hitboxes) {
                if (bestTarget.hitboxes.head?.pos) {
                    headPos = bestTarget.hitboxes.head.pos;
                    targetState.currentBoneHash = boneMap.HEAD;
                } else if (bestTarget.hitboxes.neck?.pos) {
                    headPos = bestTarget.hitboxes.neck.pos;
                    targetState.currentBoneHash = boneMap.NECK;
                }
            }

            targetState.pos = { ...headPos };
            
            let trackData = state.tracker[bestTarget.id];
            trackData.history.unshift({ pos: { ...headPos }, time: currentTime });
            if (trackData.history.length > 5) trackData.history.pop(); 

            let prevFrame = trackData.history[1] || trackData.history[0];
            let dt = Math.min(Math.max((currentTime - prevFrame.time) / 1000.0, 0.001), 0.033);

            let raw_vx = (headPos.x - prevFrame.pos.x) / dt;
            let raw_vy = (headPos.y - prevFrame.pos.y) / dt;
            let raw_vz = (headPos.z - prevFrame.pos.z) / dt;
            
            let speedMag = Math.sqrt(raw_vx*raw_vx + raw_vy*raw_vy + raw_vz*raw_vz);
            if (speedMag > this.MAX_HUMAN_SPEED) {
                let ratio = this.MAX_HUMAN_SPEED / speedMag;
                raw_vx *= ratio; raw_vy *= ratio; raw_vz *= ratio;
            }
            
            let alphaX = (Math.sign(trackData.velocity.x) !== Math.sign(raw_vx) && Math.abs(raw_vx) > 1.5) ? 0.98 : 0.75;
            let alphaZ = (Math.sign(trackData.velocity.z) !== Math.sign(raw_vz) && Math.abs(raw_vz) > 1.5) ? 0.98 : 0.75;

            trackData.velocity.x = (raw_vx * alphaX) + (trackData.velocity.x * (1 - alphaX));
            trackData.velocity.y = (raw_vy * 0.85) + (trackData.velocity.y * 0.15);
            trackData.velocity.z = (raw_vz * alphaZ) + (trackData.velocity.z * (1 - alphaZ));
            
            let edgeOffsetX = 0, edgeOffsetZ = 0;
            let speedXZ = Math.sqrt(trackData.velocity.x**2 + trackData.velocity.z**2);
            
            if (speedXZ > 1.2) {
                let dirX = trackData.velocity.x / speedXZ;
                let dirZ = trackData.velocity.z / speedXZ;
                edgeOffsetX = dirX * this.HEAD_RADIUS;
                edgeOffsetZ = dirZ * this.HEAD_RADIUS;
            }

            let bullet_t = bestTarget.distance > 20.0 ? 0.010 : 0.025; 

            // Đạn đoán tương lai
            targetState.predicted_pos = { 
                x: headPos.x + (trackData.velocity.x * bullet_t) + edgeOffsetX, 
                y: headPos.y, // Khóa chết trục Y 
                z: headPos.z + (trackData.velocity.z * bullet_t) + edgeOffsetZ 
            };

            // Camera ngắm thẳng Đầu thực tại (Không dùng Silent Aim Ngực nữa)
            targetState.silent_predicted_pos = { x: headPos.x, y: headPos.y, z: headPos.z };

        } else {
            targetState.id = null; targetState.predicted_pos = null; targetState.silent_predicted_pos = null;
        }

        return payload;
    }
}

// ============================================================================
// MODULE 7: CAMERA MANIPULATOR V21.0 – ANTI-GRAVITY THRUST & ABS BRAKING
// Nhiệm vụ: Bơm lực hút tịnh tiến đẩy Camera thẳng lên đầu, Khuếch đại lực 
//           vuốt tay của người chơi lên 3 lần, Phanh ABS đóng băng khi chạm sọ.
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

        if (!targetState.id || !weaponState.isFiring || !targetState.predicted_pos) {
            camState.warpPhase = 0; 
            camState.smoothDragY = 0;
            camState.smoothDragX = 0;
            camState.fireStartTime = 0;
            return payload;
        }

        if (!camState.fireStartTime) camState.fireStartTime = Date.now();
        const fireDuration = Date.now() - camState.fireStartTime;

        let rawDragY = 0, rawDragX = 0;
        if (payload.touch_delta) {
            rawDragX = payload.touch_delta.x || 0;
            rawDragY = payload.touch_delta.y || 0;
        } else if (payload.input_drag) {
            rawDragX = payload.input_drag.x || 0;
            rawDragY = payload.input_drag.y || 0;
        }

        camState.smoothDragY = (rawDragY * 0.6) + ((camState.smoothDragY || 0) * 0.4);
        camState.smoothDragX = (rawDragX * 0.6) + ((camState.smoothDragX || 0) * 0.4);

        let isSwipingHard = (Math.abs(rawDragX) > 3.0 || Math.abs(rawDragY) > 3.0);
        
        if (fireDuration > 150 && isSwipingHard) {
            if (payload.touch_delta) { payload.touch_delta.x *= 0.7; payload.touch_delta.y *= 0.7; }
            return payload; 
        } else {
            if (payload.touch_delta) payload.touch_delta = { x: 0, y: 0 };
            if (payload.input_drag) payload.input_drag = { x: 0, y: 0 };
            if (payload.joystick_delta) payload.joystick_delta = { x: 0, y: 0 }; 
            if (payload.mouse_delta) payload.mouse_delta = { x: 0, y: 0 }; 
        }
        
        let currentPitch = payload.camera ? payload.camera.pitch : (payload.aim_pitch || 0);
        let currentYaw = payload.camera ? payload.camera.yaw : (payload.aim_yaw || 0);
        let origin = payload.fire_origin || state.self.anchorPos;
        
        let dest = targetState.silent_predicted_pos; // Trực tiếp trỏ vào Đầu, không qua Ngực
        let dx = dest.x - origin.x, dy = dest.y - origin.y, dz = dest.z - origin.z;
        let distXZ = Math.sqrt(dx * dx + dz * dz) || 0.0001;

        let targetYaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
        let targetPitch = -Math.atan2(dy, distXZ) * (180.0 / Math.PI); 

        let rawErrorPitch = this.normalizeAngle(targetPitch - currentPitch);
        let rawErrorYaw = this.normalizeAngle(targetYaw - currentYaw);

        let curveYawOffset = 0;
        if (Math.abs(rawErrorPitch) > 12.0) {
            let progress = Math.min(Math.abs(rawErrorPitch) / 45.0, 1.0);
            let curveFactor = Math.sin(progress * Math.PI); 
            let curveDir = rawErrorYaw >= 0 ? 1 : -1; 
            curveYawOffset = curveFactor * 12.0 * curveDir; 
        }
        let curvedTargetYaw = targetYaw + curveYawOffset;

        let recoilY = payload.weapon ? (payload.weapon.recoil_y || payload.weapon.recoil_accumulation || 0.0) : 0.0;
        let recoilX = payload.weapon ? (payload.weapon.recoil_x || 0.0) : 0.0;

        // ==========================================================
        // 5. ANTI-GRAVITY THRUST & ASYMMETRIC DRAG (BƠM LỰC ĐẨY TÂM)
        // ==========================================================
        let thrustPitch = 0;
        let thrustYaw = 0;

        if (Math.abs(rawErrorPitch) > 3.0) {
            // [A. Lực hút vô hình]: Tự động kéo tâm lên đầu 15% mỗi frame (bất chấp người chơi không vuốt)
            thrustPitch = rawErrorPitch * 0.15; 
            
            // [B. Khuếch đại lực tay Bất đối xứng]: 
            if (Math.sign(camState.smoothDragY) === Math.sign(rawErrorPitch)) {
                // Người chơi đang vuốt tay HƯỚNG VỀ PHÍA ĐẦU -> Nhân 3.5 lần lực vuốt để Tốc biến lên sọ
                thrustPitch += (camState.smoothDragY * 3.5); 
            } else {
                // Người chơi vuốt NGƯỢC HƯỚNG (VD: tâm đang ở bụng, lại cố vuốt xuống đất) -> Triệt tiêu 90% lực
                thrustPitch += (camState.smoothDragY * 0.1); 
            }
        } else {
            // [C. PHANH ABS KHI CHẠM SỌ]: Tâm đã vào rìa đầu (Sai số < 3.0 độ)
            // Đóng băng đà vuốt bằng cách bơm bù trừ âm GẤP 2.5 LẦN lực vuốt dư thừa
            thrustPitch = rawErrorPitch; // Gắn chết vào mục tiêu
            thrustPitch -= (camState.smoothDragY * 2.5); // Phản lực hãm phanh
        }

        // Áp dụng lực đẩy và trừ độ giật súng
        let idealPitch = currentPitch + thrustPitch - recoilY;
        let idealYaw = curvedTargetYaw - recoilX;

        let errorPitch = this.normalizeAngle(idealPitch - currentPitch);
        let errorYaw = this.normalizeAngle(idealYaw - currentYaw);
        let totalError = Math.sqrt(errorPitch*errorPitch + errorYaw*errorYaw);

        let nextPitch, nextYaw;
        if (camState.warpPhase === undefined) camState.warpPhase = 0;

        if (totalError > 18.0) {
            if (camState.warpPhase === 0) {
                camState.warpPhase = 1;
                nextPitch = currentPitch + (errorPitch * 0.65);
                nextYaw = currentYaw + (errorYaw * 0.65);
            } else {
                camState.warpPhase = 0;
                nextPitch = idealPitch;
                nextYaw = idealYaw;
            }
        } else {
            camState.warpPhase = 0;
            nextPitch = idealPitch;
            nextYaw = idealYaw;
        }

        let finalErrorPitch = this.normalizeAngle(nextPitch - currentPitch);
        let finalErrorYaw = this.normalizeAngle(nextYaw - currentYaw);

        if (Math.abs(finalErrorPitch) < 0.05) nextPitch = camState.lastPitch || nextPitch; 
        if (Math.abs(finalErrorYaw) < 0.05) nextYaw = camState.prevYaw || nextYaw;

        camState.lastPitch = nextPitch;
        camState.prevYaw = nextYaw;
        
        if (payload.camera) {
            payload.camera.pitch = nextPitch;
            payload.camera.yaw = nextYaw;
        } else {
            payload.aim_pitch = nextPitch;
            payload.aim_yaw = nextYaw;
        }

        if (payload.camera_constraints) {
            payload.camera_constraints.max_pitch_speed = 99999.0;
            payload.camera_constraints.max_yaw_speed = 99999.0;
            payload.camera_constraints.friction = 0.0;
            payload.camera_constraints.damping = 0.0;
            payload.camera_constraints.snap_resistance = 0.0; 
            payload.camera_constraints.recoil_recovery_scale = 0.0;
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
