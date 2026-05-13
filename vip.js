/**
 * ==============================================================================
 * PROJECT: OMNI-MATRIX V2.3 (PERFECT PIPELINE ARCHITECTURE)
 * Pipeline: Sanitizer -> M1(Gun) -> M4(Eyes) -> M7(Camera) -> TriggerCheck -> M5(Stance) -> M2/3/6(Physics) -> M8(Magic)
 * Status: Framework initialized. Modules pending deployment.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);

// ============================================================================
// 0. GLOBAL STATE (BỘ NHỚ DÙNG CHUNG ĐỒNG BỘ TỔNG V2.3)
// ============================================================================
if (!_global.__OmniState || _global.__OmniState.version !== "MATRIX_V2.3") {
    _global.__OmniState = {
        version: "MATRIX_V2.3",
        currentPing: 50.0,
        weaponProfile: { Core: "IGNORE", RequireZeroVelocity: false },
        
        target: { id: null, pos: null, predicted_pos: null, distance: 9999.0 },
        self: { pos: {x:0, y:0, z:0}, anchorPos: {x:0, y:0, z:0}, vel: {x:0, y:0, z:0}, isPerfectlyStill: false, anchoredFireOrigin: null },
        
        // Bổ sung triggerFired để giao tiếp giữa M6_TriggerCheck và M5
        weapon: { isFiring: false, id: "", category: "", triggerFired: false }, 
        
        tracker: {}, 
        
        camera: {
            lastTime: Date.now(),
            integralYaw: 0.0,
            integralPitch: 0.0,
            prevErrorYaw: 0.0,
            prevErrorPitch: 0.0
        }
    };
}

// ============================================================================
// VỎ BỌC CÁC MODULE (SẼ ĐƯỢC ĐỔ CODE VÀO CÁC BƯỚC TIẾP THEO)
// LƯU Ý: Không xóa các class rỗng này, chúng giữ vai trò định hình scope.
// ============================================================================
// ============================================================================
// MODULE 1: WEAPON CLASSIFIER (LÕI NHẬN DIỆN VŨ KHÍ)
// Nhiệm vụ: Phân tích siêu dữ liệu súng, quyết định kích hoạt Lõi Sát Thương nào
// và thiết lập cờ vận tốc (RequireZeroVelocity) cho TriggerBot.
// ============================================================================
class WeaponClassifier {
    
    // Thuật toán nhận diện dựa trên ID, Tên và Danh mục (Category)
    static classify(weaponData) {
        let profile = { 
            Core: "IGNORE", 
            RequireZeroVelocity: false 
        };
        
        if (!weaponData) return profile;

        // Ép kiểu về Chuỗi IN HOA để chống lỗi phân biệt hoa/thường từ Server
        const id = (weaponData.id || "").toString().toUpperCase();
        const name = (weaponData.name || "").toString().toUpperCase();
        const category = (weaponData.category || "").toString().toUpperCase();

        // Gộp chung thành một chuỗi nhận dạng để quét bằng từ khóa
        const identifier = `${id}_${name}_${category}`;

        // 1. NHÓM SHOTGUN (Kích hoạt Module 2: Gom tia Laser)
        if (identifier.includes("SHOTGUN") || identifier.includes("M1887") || 
            identifier.includes("M1014") || identifier.includes("SPAS") || 
            identifier.includes("MAG-7") || identifier.includes("TROGON") || identifier.includes("CHARGE")) {
            profile.Core = "SHOTGUN";
        } 
        
        // 2. NHÓM ONE-TAP / SNIPER (Kích hoạt Module 6: TriggerBot)
        else if (identifier.includes("SNIPER") || identifier.includes("PISTOL") || 
                 identifier.includes("DESERT_EAGLE") || identifier.includes("WOODPECKER") || 
                 identifier.includes("SVD") || identifier.includes("AC80") || 
                 identifier.includes("AWM") || identifier.includes("M82B") || identifier.includes("KAR98")) {
            profile.Core = "ONETAP";
            // Kích hoạt cờ này để báo cho M5 biết: Bắt buộc phải đóng băng vận tốc
            // trước khi cho phép M6 tự động bóp cò.
            profile.RequireZeroVelocity = true; 
        } 
        
        // 3. NHÓM AUTO / SMG / AR (Kích hoạt Module 3: Khóa chặt luồng đạn)
        else if (identifier.includes("SMG") || identifier.includes("AR") || 
                 identifier.includes("MACHINE") || identifier.includes("LMG") || 
                 identifier.includes("MP40") || identifier.includes("UMP") || 
                 identifier.includes("AK") || identifier.includes("SCAR") || 
                 identifier.includes("GROZA") || identifier.includes("FAMAS")) {
            profile.Core = "AUTO";
        }

        // Lưu ý: Nếu cầm Lựu Đạn, Đao, Machete, Keo, biến identifier sẽ không khớp
        // với bất kỳ từ khóa nào ở trên -> Trả về "IGNORE" (Bỏ qua can thiệp).
        return profile;
    }

    static processWeaponState(payload) {
        const weaponState = _global.__OmniState.weapon;

        // Trích xuất và đồng bộ trạng thái bóp cò
        // (Free Fire có thể gửi cờ is_firing ở ngoài root hoặc bên trong object weapon)
        if (payload.is_firing !== undefined) {
            weaponState.isFiring = payload.is_firing;
        }

        if (payload.weapon) {
            if (payload.weapon.is_firing !== undefined) {
                weaponState.isFiring = payload.weapon.is_firing;
            }
            
            // Nếu có sự thay đổi vũ khí (đổi súng), cập nhật ngay Profile mới
            if (payload.weapon.id !== undefined && payload.weapon.id !== weaponState.id) {
                weaponState.id = payload.weapon.id;
                weaponState.category = payload.weapon.category || "";
                
                // Chạy thuật toán phân loại và lưu Profile vào Bộ nhớ Tổng
                _global.__OmniState.weaponProfile = this.classify(payload.weapon);
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 4: TARGET KINEMATICS (LÕI ĐỘNG HỌC MỤC TIÊU - TỐI ƯU HÓA LẮC NGANG)
// Cập nhật Strafe Dampener: Xử lý hoàn hảo các pha lách trái/phải liên tục.
// ============================================================================
class TargetKinematics {
    
    static normalizeAngle(angle) {
        while (angle > 180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }

    static processTargetState(payload) {
        if (payload.anchorPos !== undefined) {
            _global.__OmniState.self.anchorPos = { ...payload.anchorPos };
        } else if (payload.pos !== undefined && _global.__OmniState.self.anchorPos.x === 0) {
            _global.__OmniState.self.anchorPos = { ...payload.pos };
        }

        if (payload.aim_assist !== undefined) {
            payload.aim_assist.friction = 0.0;
            payload.aim_assist.adhesion = 0.0;
            payload.aim_assist.snap_weight = -9999.0;
        }

        if (!payload || !payload.players || !Array.isArray(payload.players)) return payload;

        const selfState = _global.__OmniState.self;
        if (!selfState.anchorPos || selfState.anchorPos.x === 0) return payload; 

        let bestTarget = null;
        let lowestThreatScore = 999999.0;
        const currentYaw = payload.aim_yaw !== undefined ? payload.aim_yaw : (_global.__OmniState.camera.prevYaw || 0.0);
        if (payload.aim_yaw !== undefined) _global.__OmniState.camera.prevYaw = payload.aim_yaw;

        for (let i = 0; i < payload.players.length; i++) {
            const enemy = payload.players[i];
            
            if (enemy.hitboxes) {
                const bodyParts = ['head', 'chest', 'pelvis', 'legs', 'arms'];
                for (let p = 0; p < bodyParts.length; p++) {
                    if (enemy.hitboxes[bodyParts[p]]) {
                        if (enemy.hitboxes[bodyParts[p]].friction !== undefined) enemy.hitboxes[bodyParts[p]].friction = 0.0;
                        if (enemy.hitboxes[bodyParts[p]].snap_weight !== undefined) enemy.hitboxes[bodyParts[p]].snap_weight = -9999.0;
                    }
                }
            }

            if (enemy.is_dead || enemy.hp <= 0 || enemy.is_knocked) continue;
            if (enemy.team_id !== undefined && enemy.team_id === _global.__OmniState.team_id) continue;
            if (!enemy.pos) continue;

            const dx = enemy.pos.x - selfState.anchorPos.x;
            const dy = enemy.pos.y - selfState.anchorPos.y;
            const dz = enemy.pos.z - selfState.anchorPos.z;
            const distance3D = Math.sqrt(dx*dx + dy*dy + dz*dz);

            if (distance3D > 300.0) continue;

            let threatScore = distance3D; 

            let angleToMe = Math.atan2(-dx, -dz) * (180.0 / Math.PI);
            let enemyYaw = enemy.aim_yaw || enemy.yaw || 0.0;
            let isLookingAtMe = Math.abs(this.normalizeAngle(enemyYaw - angleToMe)) < 30.0;
            if (isLookingAtMe) threatScore -= 200.0; 

            if (enemy.weapon && enemy.weapon.category) {
                let cat = enemy.weapon.category.toUpperCase();
                if (cat.includes("SNIPER") || cat.includes("SHOTGUN")) threatScore -= 100.0;
            }
            let angleToEnemy = Math.atan2(dx, dz) * (180.0 / Math.PI);
            let fovDiff = Math.abs(this.normalizeAngle(angleToEnemy - currentYaw));
            let fovPenalty = fovDiff * (distance3D < 10.0 ? 1.0 : 3.5);
            const hpMissingBonus = ((enemy.max_hp || 200.0) - (enemy.hp || 200.0)) * 0.8; 
            
            threatScore = threatScore + fovPenalty - hpMissingBonus;

            if (threatScore < lowestThreatScore) {
                lowestThreatScore = threatScore;
                bestTarget = enemy;
                bestTarget.distance = distance3D;
            }
        }

        if (bestTarget) {
            const targetState = _global.__OmniState.target;
            const tracker = _global.__OmniState.tracker;
            const currentTime = Date.now();

            targetState.id = bestTarget.id;
            targetState.distance = bestTarget.distance;
            
            let headCenter = bestTarget.hitboxes?.head?.pos || { x: bestTarget.pos.x, y: bestTarget.pos.y + 1.5, z: bestTarget.pos.z };
            let targetAimPos = headCenter;
            
            if (bestTarget.distance <= 5.0 && bestTarget.hitboxes?.chest) targetAimPos = bestTarget.hitboxes.chest.pos; 

            targetState.pos = { ...targetAimPos };

            if (!tracker[bestTarget.id]) {
                tracker[bestTarget.id] = { 
                    history: [], 
                    velocity: {x:0, y:0, z:0},
                    lastVelocity: {x:0, y:0, z:0} 
                };
                targetState.predicted_pos = { ...targetAimPos }; 
            } 
            else {
                let trackData = tracker[bestTarget.id];
                
                trackData.history.unshift({ pos: { ...targetAimPos }, time: currentTime });
                if (trackData.history.length > 10) trackData.history.pop();

                let prevFrame = trackData.history[1] || trackData.history[0];
                let dt = (currentTime - prevFrame.time) / 1000.0;
                
                if (dt > 0.0 && dt < 0.2) { 
                    let vx = (targetAimPos.x - prevFrame.pos.x) / dt;
                    let vy = (targetAimPos.y - prevFrame.pos.y) / dt;
                    let vz = (targetAimPos.z - prevFrame.pos.z) / dt;
                    let speed = Math.sqrt(vx*vx + vy*vy + vz*vz);
                    trackData.velocity = { x: vx, y: vy, z: vz };

                    let ax = 0, ay = 0, az = 0;
                    if (trackData.lastVelocity) {
                        ax = (vx - trackData.lastVelocity.x) / dt;
                        ay = (vy - trackData.lastVelocity.y) / dt;
                        az = (vz - trackData.lastVelocity.z) / dt;
                    }
                    trackData.lastVelocity = { x: vx, y: vy, z: vz };

                    const pingDelay = _global.__OmniState.currentPing / 1000.0;
                    let bulletSpeed = 850.0; 
                    if (_global.__OmniState.weaponProfile.Core === "SHOTGUN") bulletSpeed = 400.0;
                    
                    let timeToTarget = pingDelay + (bestTarget.distance / bulletSpeed);
                    if (timeToTarget > 0.35) timeToTarget = 0.35; 

                    // [BẢN VÁ]: KIỂM SOÁT GIA TỐC NGANG (CHỐNG BẮN LỐ KHI ĐỊCH LẮC)
                    let accelMagXZ = Math.sqrt(ax*ax + az*az);
                    let strafeDampener = 1.0;
                    
                    if (accelMagXZ > 40.0) {
                        // Kẻ địch lắc ziczac quá gắt, bóp nghẹt 90% gia tốc để đạn không bị văng xa
                        strafeDampener = 0.1; 
                    } else if (accelMagXZ > 15.0) {
                        // Kẻ địch đang lách trái/phải cơ bản
                        strafeDampener = 0.4;
                    }

                    let predX = targetAimPos.x + (vx * timeToTarget) + (0.5 * ax * timeToTarget * timeToTarget * strafeDampener);
                    let predZ = targetAimPos.z + (vz * timeToTarget) + (0.5 * az * timeToTarget * timeToTarget * strafeDampener);
                    let predY = targetAimPos.y + (vy * timeToTarget);

                    let isJumping = Math.abs(vy) > 1.2 && speed <= 12.0; 
                    if (isJumping) {
                        predY -= 0.5 * 9.81 * (timeToTarget * timeToTarget);
                    }

                    targetState.predicted_pos = { x: predX, y: predY, z: predZ };
                    
                } else {
                    targetState.predicted_pos = { ...targetAimPos };
                }
            }
        } else {
            _global.__OmniState.target = { id: null, pos: null, predicted_pos: null, distance: 9999.0 };
        }

        return payload;
    }
}

// ============================================================================
// MODULE 7: CAMERA MANIPULATOR (LÕI ĐIỀU HƯỚNG - BẢN VÁ LỆCH TÂM NGANG)
// Tách biệt Thị giác và Đạn đạo. Camera chỉ nhìn vào Hiện Tại (pos).
// Đảm bảo Crosshair KHÔNG bị kéo đi trước mặt hoặc chúi xuống đất khi địch nhảy.
// ============================================================================
class CameraManipulator {
    
    static normalizeAngle(angle) {
        while (angle > 180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }

    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;
        const camState = _global.__OmniState.camera;
        const weaponState = _global.__OmniState.weapon;

        if (!targetState.id || !targetState.pos || payload.aim_yaw === undefined) {
            camState.wasFiring = false;
            return payload;
        }

        const isFiring = weaponState.isFiring || weaponState.triggerFired || payload.is_firing;
        const isPending = weaponState.isPendingFire || weaponState.forceAbsoluteSnap;
        const isScoping = payload.is_scoping || (payload.weapon && payload.weapon.is_scoping);
        
        camState.wasFiring = isFiring || isPending;

        if (!isFiring && !isScoping && !isPending) {
            camState.integralYaw = 0;
            camState.integralPitch = 0;
            return payload;
        }

        const origin = selfState.lastAnchor ? 
            { x: selfState.lastAnchor.x, y: selfState.lastAnchor.y + 1.5, z: selfState.lastAnchor.z } : 
            { x: selfState.anchorPos.x, y: selfState.anchorPos.y + 1.5, z: selfState.anchorPos.z };
            
        // [SỬA LỖI CHÍNH Ở ĐÂY]: DÙNG POS HIỆN TẠI THAY VÌ PREDICTED_POS
        // Màn hình chỉ cần dính chặt vào sọ địch thực tế. 
        // Việc bắn đón tương lai cứ để Lõi M8 (Magic Bullet) lo!
        const dest = targetState.pos; 

        const dx = dest.x - origin.x;
        const dy = dest.y - origin.y;
        const dz = dest.z - origin.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz);

        let trueYaw = this.normalizeAngle(Math.atan2(dx, dz) * (180.0 / Math.PI));
        let truePitch = this.normalizeAngle(Math.atan2(-dy, distXZ) * (180.0 / Math.PI));

        const currentYaw = payload.aim_yaw;
        const currentPitch = payload.aim_pitch;

        let errorYaw = this.normalizeAngle(trueYaw - currentYaw);
        let errorPitch = this.normalizeAngle(truePitch - currentPitch);

        const currentTime = Date.now();
        let dt = (currentTime - (camState.lastTime || currentTime)) / 1000.0;
        if (dt <= 0.0 || dt > 0.1) dt = 0.016; 
        camState.lastTime = currentTime;

        let outputYawStep = 0;
        let outputPitchStep = 0;
        let isAbsoluteLock = false;

        // ====================================================================
        // GIAO THỨC VẨY TÂM (DRAG-SHOT CHUẨN XÁC VÀO ĐẦU)
        // ====================================================================
        if (weaponState.forceAbsoluteSnap) {
            outputYawStep = errorYaw * 0.6;
            outputPitchStep = errorPitch * 0.6;
            camState.integralYaw = 0;
            camState.integralPitch = 0;
            isAbsoluteLock = true;
        }
        else if (targetState.distance < 3.0) {
            outputYawStep = errorYaw * 4.0 * dt; 
            outputPitchStep = errorPitch * 4.0 * dt;
            let maxStep = 45.0 * dt; 
            outputYawStep = Math.max(-maxStep, Math.min(maxStep, outputYawStep));
            outputPitchStep = Math.max(-maxStep, Math.min(maxStep, outputPitchStep));
        } 
        else {
            const dynamicDeadzone = (isFiring || isPending) ? 0.8 : 0.35; 
            
            if (Math.abs(errorYaw) <= dynamicDeadzone && Math.abs(errorPitch) <= dynamicDeadzone) {
                outputYawStep = errorYaw;
                outputPitchStep = errorPitch;
                camState.integralYaw = 0;
                camState.integralPitch = 0;
                isAbsoluteLock = true; 
            } 
            else {
                let Kp_yaw = 45.0; 
                let Kp_pitch = 60.0; 
                let baseKd = 0.2;
                let dynamicKd_yaw = baseKd + (8.0 / (Math.abs(errorYaw) + 0.5));
                let dynamicKd_pitch = baseKd + (12.0 / (Math.abs(errorPitch) + 0.5));
                let Ki = 0.01;

                camState.integralYaw = (camState.integralYaw || 0) + (errorYaw * dt);
                camState.integralPitch = (camState.integralPitch || 0) + (errorPitch * dt);

                let derivYaw = (errorYaw - (camState.prevErrorYaw || errorYaw)) / dt;
                let derivPitch = (errorPitch - (camState.prevErrorPitch || errorPitch)) / dt;

                outputYawStep = ((errorYaw * Kp_yaw) + (camState.integralYaw * Ki) + (derivYaw * dynamicKd_yaw)) * dt;
                outputPitchStep = ((errorPitch * Kp_pitch) + (camState.integralPitch * Ki) + (derivPitch * dynamicKd_pitch)) * dt;

                if (Math.abs(outputPitchStep) > Math.abs(errorPitch)) {
                    outputPitchStep = errorPitch; 
                    camState.integralPitch = 0;   
                }
                if (Math.abs(outputYawStep) > Math.abs(errorYaw)) {
                    outputYawStep = errorYaw;
                    camState.integralYaw = 0;
                }
            }
        }

        camState.prevErrorYaw = errorYaw;
        camState.prevErrorPitch = errorPitch;

        if (camState.emaYaw === undefined) camState.emaYaw = currentYaw;
        if (camState.emaPitch === undefined) camState.emaPitch = currentPitch;

        let rawNewYaw = currentYaw + outputYawStep;
        let rawNewPitch = currentPitch + outputPitchStep;

        let alpha = (isFiring || isAbsoluteLock || isPending) ? 1.0 : 0.85; 

        camState.emaYaw = this.normalizeAngle((rawNewYaw * alpha) + (camState.emaYaw * (1.0 - alpha)));
        camState.emaPitch = this.normalizeAngle((rawNewPitch * alpha) + (camState.emaPitch * (1.0 - alpha)));

        payload.aim_yaw = camState.emaYaw;
        payload.aim_pitch = camState.emaPitch;

        if (payload.camera_state) {
            payload.camera_state.yaw = payload.aim_yaw;
            payload.camera_state.pitch = payload.aim_pitch;
            delete payload.camera_state.target_x;
            delete payload.camera_state.target_y;
            delete payload.camera_state.target_z;
        }

        return payload;
    }
}

// ============================================================================
// MODULE 6.5: TRIGGER CHECK (BỘ LỌC ĐỒNG BỘ - BẢN VÁ DRAG-SHOT 200ms)
// Tích hợp: 0.2s Delayed Execution, Force Snap Signal.
// ============================================================================
class TriggerCheck {
    static evaluate(payload) {
        const targetState = _global.__OmniState.target;
        const weaponState = _global.__OmniState.weapon;
        const profile = _global.__OmniState.weaponProfile;

        // Reset tín hiệu phát sóng
        weaponState.triggerFired = false;
        if (profile.Core === "IGNORE") return payload;

        let isManualFiring = payload.is_firing || (payload.weapon && payload.weapon.is_firing);

        // ====================================================================
        // GIAO THỨC DRAG-SHOT (VẨY TÂM CÓ ĐỘ TRỄ 200ms)
        // ====================================================================
        if (isManualFiring && targetState.id && targetState.predicted_pos) {
            
            // Nếu là frame đầu tiên chạm nút bắn, khởi động Đồng hồ đếm ngược
            if (!weaponState.aimSnapStartTime) {
                weaponState.aimSnapStartTime = Date.now();
                weaponState.isPendingFire = true;
            }

            // Tính toán thời gian đã trôi qua kể từ lúc chạm nút bắn
            const elapsed = Date.now() - weaponState.aimSnapStartTime;

            // PHA 1: TRONG VÒNG 0.2 GIÂY ĐẦU TIÊN (200ms)
            if (elapsed < 200) {
                // 1. Tịch thu lệnh khai hỏa (Cấm nổ súng)
                payload.is_firing = false;
                if (payload.weapon) payload.weapon.is_firing = false;
                weaponState.isFiring = false;
                
                // 2. Phát lệnh báo động đỏ cho Module 7: "VẨY TÂM NGAY LẬP TỨC!"
                weaponState.forceAbsoluteSnap = true; 
                
                return payload; // Trả gói tin đi, súng không nổ nhưng màn hình đang lia
            } 
            // PHA 2: SAU 0.2 GIÂY
            else {
                // Nhả cò súng, tắt lệnh báo động đỏ
                weaponState.forceAbsoluteSnap = false; 
                weaponState.isPendingFire = false;
                
                // Tiếp tục xử lý Hitchance và Pre-fire bên dưới
            }
        } else {
            // Nếu nhả nút bắn hoặc mất mục tiêu -> Reset toàn bộ hệ thống đếm giờ
            weaponState.aimSnapStartTime = null;
            weaponState.isPendingFire = false;
            weaponState.forceAbsoluteSnap = false;
        }

        // ====================================================================
        // KIỂM TRA HITCHANCE & THỰC THI (Bảo lưu code cũ của bạn)
        // ====================================================================
        if (!targetState.id || !targetState.predicted_pos) {
            if (isManualFiring) {
                payload.is_firing = false;
                if (payload.weapon) payload.weapon.is_firing = false;
                weaponState.isFiring = false;
            }
            return payload;
        }

        let hitchance = 100.0;
        const tracker = _global.__OmniState.tracker[targetState.id];
        
        if (tracker && tracker.is_behind_cover && profile.Core !== "ONETAP") {
            hitchance = 0.0; 
        }

        if (hitchance === 0.0) {
            payload.is_firing = false;
            if (payload.weapon) payload.weapon.is_firing = false;
            weaponState.isFiring = false;
            return payload;
        }

        if (isManualFiring) {
            payload.is_firing = true;
            if (payload.weapon) {
                payload.weapon.is_firing = true;
                if (payload.weapon.charge_time !== undefined) payload.weapon.charge_time = 9999.0;
            }
            weaponState.isFiring = true;
            weaponState.triggerFired = true; 
        }

        return payload;
    }
}

// ============================================================================
// MODULE 5: SELF KINEMATICS (LÕI ĐỘNG HỌC BẢN THÂN - SINGULARITY MERGE)
// Tích hợp: Chronos Anchor (Neo Thời Không T-1), CQC Origin Spoofing 
// (Dịch chuyển nòng súng cận chiến), và Triệt tiêu Rubber-Banding.
// ============================================================================
class SelfKinematics {
    static processSelfState(payload) {
        const state = _global.__OmniState.self;
        const targetState = _global.__OmniState.target;
        const weaponState = _global.__OmniState.weapon;
        
        // Nhận diện trạng thái bóp cò
        const isFiring = weaponState.isFiring || weaponState.triggerFired || payload.is_firing;

        // Khởi tạo bộ nhớ Lịch sử Không gian (Tracking History)
        if (!state.history) state.history = [];
        if (!state.lastAnchor) state.lastAnchor = null;

        // ====================================================================
        // TRẠNG THÁI NGHỈ: LIÊN TỤC CẬP NHẬT TỌA ĐỘ (CHỐNG GIẬT LAG)
        // ====================================================================
        // KHÔNG BAO GIỜ can thiệp vào pos và velocity khi đang di chuyển bình thường.
        // Điều này đảm bảo Server Reconciliation không giật lùi nhân vật của bạn.
        if (payload.pos !== undefined) {
            state.history.unshift({ ...payload.pos });
            if (state.history.length > 5) state.history.pop(); // Chỉ lưu 5 frames gần nhất
        }

        if (!isFiring) {
            // Liên tục lưu Anchor (Điểm neo súng) của frame hiện tại
            if (payload.anchorPos !== undefined) {
                state.lastAnchor = { ...payload.anchorPos };
            }
            return payload; 
        }

        // ====================================================================
        // TRẠNG THÁI KHAI HỎA: KÍCH HOẠT ĐIỂM KỲ DỊ (SINGULARITY)
        // ====================================================================
        
        // 1. CHRONOS ANCHOR (NEO THỜI KHÔNG T-1)
        // Khi nổ súng, chúng ta không khóa 'pos' (Cơ thể) nữa để Server không báo lỗi.
        // Chúng ta CHỈ khóa 'anchorPos' (Bệ phóng đạn) về tọa độ của mili-giây trước đó.
        if (payload.anchorPos !== undefined && state.lastAnchor) {
            payload.anchorPos.x = state.lastAnchor.x;
            payload.anchorPos.y = state.lastAnchor.y;
            payload.anchorPos.z = state.lastAnchor.z;
        }

        // 2. CQC ORIGIN SPOOFING (DỊCH CHUYỂN NÒNG SÚNG CẬN CHIẾN)
        if (payload.fire_origin !== undefined) {
            // Nếu kẻ địch ở khoảng cách Cực Gần (< 3.0 mét) -> Góc quay lượng giác dễ bị văng.
            if (targetState.id && targetState.distance < 3.0 && targetState.predicted_pos) {
                // Ma thuật V85: Dịch chuyển điểm sinh đạn vào thẳng Lõi Sọ kẻ thù!
                // Viên đạn sẽ xuất hiện TỪ BÊN TRONG đầu địch, sát thương nổ ngay lập tức.
                payload.fire_origin = {
                    x: targetState.predicted_pos.x,
                    y: targetState.predicted_pos.y,
                    z: targetState.predicted_pos.z - 0.1 // Thụt vào 10cm so với tâm sọ
                };
            } 
            // Nếu ở khoảng cách xa -> Đạn sinh ra từ Anchor T-1 tĩnh lặng
            else if (state.lastAnchor) {
                payload.fire_origin = {
                    x: state.lastAnchor.x,
                    y: state.lastAnchor.y + 1.5, // Nâng lên ngang tầm mắt
                    z: state.lastAnchor.z
                };
            }
        }

        // 3. ANCHOR ROOTING (ĐÓNG BĂNG RỄ SINH HỌC)
        // Xóa sạch nhịp thở và độ rung lắc cơ thể.
        if (payload.body_sway !== undefined) payload.body_sway = 0.0;
        
        // LƯU Ý QUAN TRỌNG: 
        // Đã GỠ BỎ toàn bộ lệnh ép `payload.velocity = 0` và `payload.speed = 0`.
        // Gói tin khai hỏa giờ đây vẫn chứa vận tốc thật của bạn. Server sẽ chấp nhận
        // nó như một pha vừa chạy vừa bắn bình thường -> Tạm biệt lỗi Giật cao su (Rubber-banding)!

        return payload;
    }
}

// ============================================================================
// MODULE 2: SHOTGUN CORE (LÕI SÁT THƯƠNG CẬN CHIẾN - V2.3)
// Nhiệm vụ: Triệt tiêu nảy nòng, gom toàn bộ chùm đạn thành 1 tia Laser duy nhất,
// và xóa bỏ giới hạn giảm sát thương theo cự ly xa.
// ============================================================================
class ShotgunCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;

        // --------------------------------------------------------------------
        // 1. TRIỆT TIÊU ĐỘ GIẬT & ĐỘ NỞ TÂM VŨ KHÍ (ABSOLUTE ZERO)
        // --------------------------------------------------------------------
        if (payload.weapon) {
            // Xóa sổ độ giật (Recoil - Nảy nòng)
            if (payload.weapon.recoil_y !== undefined) payload.weapon.recoil_y = 0.0;
            if (payload.weapon.recoil_x !== undefined) payload.weapon.recoil_x = 0.0;
            if (payload.weapon.recoil_accumulation !== undefined) payload.weapon.recoil_accumulation = 0.0;
            
            // Xóa sổ độ nở tâm (Spread) - Đây là kẻ thù lớn nhất của Shotgun
            // Ép hồng tâm thu nhỏ lại bằng đầu kim
            if (payload.weapon.base_spread !== undefined) payload.weapon.base_spread = 0.0;
            if (payload.weapon.dynamic_spread !== undefined) payload.weapon.dynamic_spread = 0.0;
            if (payload.weapon.max_spread !== undefined) payload.weapon.max_spread = 0.0;
        }

        // --------------------------------------------------------------------
        // 2. GOM TIA ĐẠN (LASER PELLETS CONCENTRATION)
        // --------------------------------------------------------------------
        // Súng Shotgun bắn ra nhiều mảnh đạn (pellets) văng tứ tung. 
        // Vòng lặp này bắt từng mảnh đạn một và nắn thẳng chúng lại.
        if (payload.bullet_events && Array.isArray(payload.bullet_events)) {
            
            if (targetState.id && targetState.predicted_pos && selfState.anchorPos) {
                // Tính toán Vector hoàn hảo đâm thẳng vào Lõi Sọ tương lai
                const origin = selfState.anchorPos;
                const dest = targetState.predicted_pos;
                
                let dx = dest.x - origin.x;
                let dy = dest.y - origin.y;
                let dz = dest.z - origin.z;
                
                // Bình chuẩn hóa (Normalize) Vector hướng đạn
                const mag = Math.sqrt(dx*dx + dy*dy + dz*dz);
                const perfectDir = { x: dx/mag, y: dy/mag, z: dz/mag };

                for (let i = 0; i < payload.bullet_events.length; i++) {
                    let pellet = payload.bullet_events[i];
                    
                    // Cưỡng chế mọi mảnh đạn trong lần bóp cò bay song song tuyệt đối
                    if (pellet.ray_dir) {
                        pellet.ray_dir = { ...perfectDir };
                    }
                    
                    // Đính kèm ID nạn nhân để lát nữa M8 (Magic Bullet) bẻ cong dễ dàng hơn
                    pellet.target_id = targetState.id;
                }
            }
        }

        // --------------------------------------------------------------------
        // 3. XÓA BỎ GIỚI HẠN VẬT LÝ TẦM GẦN (POINT-BLANK OPTIMIZATION)
        // --------------------------------------------------------------------
        if (payload.damage_report) {
            // Xóa bỏ hình phạt cự ly (Damage Falloff)
            // Khẩu M1887 giờ đây bắn kẻ địch cách xa 60 mét vẫn gây sát thương như đang kề nòng vào ngực
            if (payload.damage_report.distance_penalty !== undefined) {
                payload.damage_report.distance_penalty = 0.0;
            }
            
            // Ép xuyên giáp tối đa cho từng mảnh đạn
            if (payload.damage_report.armor_penetration !== undefined) {
                payload.damage_report.armor_penetration = 1.0; // Tương đương 100% xuyên giáp
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 3: AUTO CORE (LÕI SÁT THƯƠNG LIÊN THANH - V2.3)
// Nhiệm vụ: Xóa bỏ hoàn toàn độ giật và độ nở tâm cộng dồn. 
// Khóa chặt mọi viên đạn trong băng thành 1 tia Laser liên tục.
// ============================================================================
class AutoCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;

        // --------------------------------------------------------------------
        // 1. TRIỆT TIÊU VẬT LÝ SÚNG (ABSOLUTE STABILIZATION)
        // --------------------------------------------------------------------
        if (payload.weapon) {
            // Ép độ giật về 0 tuyệt đối (Không nảy lên, không rung ngang)
            if (payload.weapon.recoil_y !== undefined) payload.weapon.recoil_y = 0.0;
            if (payload.weapon.recoil_x !== undefined) payload.weapon.recoil_x = 0.0;
            if (payload.weapon.recoil_accumulation !== undefined) payload.weapon.recoil_accumulation = 0.0;
            
            // Ép độ nở hồng tâm về 0 (Đạn bay thẳng tắp dù sấy cạn cả băng)
            if (payload.weapon.base_spread !== undefined) payload.weapon.base_spread = 0.0;
            if (payload.weapon.dynamic_spread !== undefined) payload.weapon.dynamic_spread = 0.0;
            if (payload.weapon.max_spread !== undefined) payload.weapon.max_spread = 0.0;
            if (payload.weapon.spread_add_per_shot !== undefined) payload.weapon.spread_add_per_shot = 0.0;

            // Xóa bỏ sai số khi nhân vật đang di chuyển/nhảy/ngồi
            if (payload.weapon.inaccuracy_move !== undefined) payload.weapon.inaccuracy_move = 0.0;
            if (payload.weapon.inaccuracy_jump !== undefined) payload.weapon.inaccuracy_jump = 0.0;
            if (payload.weapon.inaccuracy_crouch !== undefined) payload.weapon.inaccuracy_crouch = 0.0;
        }

        // --------------------------------------------------------------------
        // 2. KHÓA CHẶT LUỒNG ĐẠN (BULLET STREAM SYNCHRONIZATION)
        // --------------------------------------------------------------------
        // Đối với súng Auto, Game Engine sẽ gửi mảng các viên đạn bắn ra trong mỗi Tick
        if (payload.bullet_events && Array.isArray(payload.bullet_events)) {
            
            // Chỉ can thiệp bẻ tia đạn nếu M4 (Mắt thần) đã khóa được tọa độ đầu
            if (targetState.id && targetState.predicted_pos && selfState.anchorPos) {
                
                const origin = selfState.anchorPos;
                const dest = targetState.predicted_pos;
                
                // Toán học Vector: Tính hướng đạn chuẩn xác
                let dx = dest.x - origin.x;
                let dy = dest.y - origin.y;
                let dz = dest.z - origin.z;
                const mag = Math.sqrt(dx*dx + dy*dy + dz*dz);
                const perfectDir = { x: dx/mag, y: dy/mag, z: dz/mag };

                // Ép TẤT CẢ các viên đạn đi theo đúng 1 đường thẳng tắp
                for (let i = 0; i < payload.bullet_events.length; i++) {
                    let bullet = payload.bullet_events[i];
                    
                    if (bullet.ray_dir) {
                        bullet.ray_dir = { ...perfectDir };
                    }
                    
                    // Gắn nhãn ID của kẻ địch vào viên đạn để Module 8 (Magic Bullet) dễ dàng chuyển hóa sát thương
                    bullet.target_id = targetState.id;
                }
            }
        }

        // --------------------------------------------------------------------
        // 3. TỐI ƯU HÓA SÁT THƯƠNG (DEADLY PENETRATION)
        // --------------------------------------------------------------------
        if (payload.damage_report) {
            // Mặc định ép mọi viên trúng sọ (Bone: 8)
            payload.damage_report.hit_bone = 8;
            payload.damage_report.is_headshot = true;

            // Bỏ qua giáp/mũ: SMG thường bị cản bởi Giáp 3, ép xuyên giáp tuyệt đối
            if (payload.damage_report.armor_penetration !== undefined) {
                payload.damage_report.armor_penetration = 1.0; 
            }

            // Xóa bỏ khoảng cách giảm sát thương (AR/SMG bắn xa không bị yếu)
            if (payload.damage_report.distance_penalty !== undefined) {
                payload.damage_report.distance_penalty = 0.0;
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 6: ONE-TAP CORE (LÕI SÁT THƯƠNG ĐIỂM - V2.3)
// Nhiệm vụ: Triệt tiêu sai số đạn đơn, ép hồi tâm tức thì và tối ưu hóa
// phát bắn tử thần. (Nhiệm vụ tự bóp cò đã được giao cho TriggerCheck).
// ============================================================================
class OneTapCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;

        // --------------------------------------------------------------------
        // 1. TRIỆT TIÊU SAI SỐ VẬT LÝ SÚNG NGẮM/SÚNG LỤC
        // --------------------------------------------------------------------
        if (payload.weapon) {
            // Ép độ chính xác tuyệt đối cho viên đạn (Không nở tâm dù đang di chuyển)
            if (payload.weapon.base_spread !== undefined) payload.weapon.base_spread = 0.0;
            if (payload.weapon.dynamic_spread !== undefined) payload.weapon.dynamic_spread = 0.0;
            
            // Xóa nảy nòng (Recoil)
            if (payload.weapon.recoil_y !== undefined) payload.weapon.recoil_y = 0.0;
            if (payload.weapon.recoil_x !== undefined) payload.weapon.recoil_x = 0.0;
            
            // CHIẾN THUẬT SNIPER: Ép thời gian hồi tâm (Recoil Recovery) cực nhanh
            // Giúp màn hình không bị giật nảy lên sau khi bắn AWM/Woodpecker
            if (payload.weapon.recoil_recovery !== undefined) {
                payload.weapon.recoil_recovery = 9999.0; 
            }

            // Xóa mọi hình phạt di chuyển (Đã được M5 bảo chứng tĩnh lặng)
            if (payload.weapon.inaccuracy_move !== undefined) payload.weapon.inaccuracy_move = 0.0;
            if (payload.weapon.inaccuracy_jump !== undefined) payload.weapon.inaccuracy_jump = 0.0;
        }

        // --------------------------------------------------------------------
        // 2. KHÓA TIA ĐẠN (RAYCAST OVERRIDE FOR SNIPER)
        // --------------------------------------------------------------------
        // Ngay cả khi M7 (Camera) xoay chưa đến tâm hoàn hảo tuyệt đối, 
        // dòng code này sẽ bẻ cong vật lý của tia đạn để găm thẳng vào sọ.
        if (payload.bullet_events && Array.isArray(payload.bullet_events)) {
            
            if (targetState.id && targetState.predicted_pos && selfState.anchorPos) {
                const origin = selfState.anchorPos;
                const dest = targetState.predicted_pos;
                
                let dx = dest.x - origin.x;
                let dy = dest.y - origin.y;
                let dz = dest.z - origin.z;
                
                const mag = Math.sqrt(dx*dx + dy*dy + dz*dz);
                const perfectDir = { x: dx/mag, y: dy/mag, z: dz/mag };

                for (let i = 0; i < payload.bullet_events.length; i++) {
                    let bullet = payload.bullet_events[i];
                    if (bullet.ray_dir) {
                        bullet.ray_dir = { ...perfectDir };
                    }
                    // Gắn nhãn ID mục tiêu để Module 8 biến hóa sát thương
                    bullet.target_id = targetState.id;
                }
            }
        }

        // --------------------------------------------------------------------
        // 3. THIẾT LẬP SÁT THƯƠNG TỬ THẦN (ONE-SHOT KILL)
        // --------------------------------------------------------------------
        if (payload.damage_report) {
            // Ép Headshot tuyệt đối (Mã xương: 8)
            payload.damage_report.hit_bone = 8;
            payload.damage_report.is_headshot = true;
            
            // Xuyên giáp 100% - Biến mũ 3/4 của kẻ địch thành tờ giấy
            if (payload.damage_report.armor_penetration !== undefined) {
                payload.damage_report.armor_penetration = 1.0;
            }
            
            // Xóa bỏ khoảng cách giảm sát thương
            // Điều này cực kỳ kinh hoàng vì nó biến khẩu lục Desert Eagle 
            // có thể bắn xa ngang ngửa AWM mà không mất đi 1 giọt sát thương nào.
            if (payload.damage_report.distance_penalty !== undefined) {
                payload.damage_report.distance_penalty = 0.0;
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 8: MAGIC BULLET CORE (LÕI ĐẠN MA THUẬT - SINGULARITY MERGE)
// Tích hợp: Chronos Timestamp Sync (Thao túng thời gian V85), Ghost Penetration,
// Magnetic Raycast, Hitbox Purge và Miss-to-Hit Inversion.
// ============================================================================
class MagicBulletCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;
        const ping = _global.__OmniState.currentPing || 50.0;

        // Bỏ qua nếu M4 chưa cung cấp tọa độ tĩnh của điểm kỳ dị
        if (!targetState || !targetState.id || !targetState.predicted_pos) return payload;

        // ====================================================================
        // 1. NGHỊCH ĐẢO SINH TỬ (MISS-TO-HIT INVERSION)
        // ====================================================================
        // Bắt cóc gói tin báo trượt do lỗi Engine, luyện hóa thành Gói tin Trúng đích.
        if (payload.miss_event || (payload.bullet_event && payload.bullet_event.is_hit === false)) {
            if (payload.miss_event) {
                payload.hit_event = { ...payload.miss_event }; 
                delete payload.miss_event; 
            }
            if (payload.bullet_event) {
                payload.bullet_event.is_hit = true;
            }
            if (!payload.hit_event) payload.hit_event = {};
            payload.hit_event.target_id = targetState.id;
        }

        // ====================================================================
        // 2. THANH TRỪNG THỂ XÁC (ANTI-OVERLAP)
        // ====================================================================
        if (payload.players && Array.isArray(payload.players)) {
            for (let i = 0; i < payload.players.length; i++) {
                let enemy = payload.players[i];
                if (enemy.hitboxes) {
                    const bodyParts = ['head', 'chest', 'pelvis', 'legs', 'arms'];
                    for (let p = 0; p < bodyParts.length; p++) {
                        // Thu nhỏ toàn bộ hitbox Server xuống mức siêu vi
                        // Đảm bảo tia đạn đi xuyên qua mọi vật thể cản đường
                        if (enemy.hitboxes[bodyParts[p]]) enemy.hitboxes[bodyParts[p]].radius = 0.01; 
                    }
                }
            }
        }

        // ====================================================================
        // 3. TỪ TRƯỜNG BẺ CONG TIA CHIẾU (MAGNETIC RAYCAST)
        // ====================================================================
        let perfectDir = null;
        
        // Khớp nối hoàn hảo với Neo Thời Không (M5)
        // Nếu M5 CQC đã bóp méo fire_origin vào sọ địch, ta tính vector từ đó.
        // Nếu không, ta lấy lastAnchor của M5 làm điểm tựa gốc.
        let origin = payload.fire_origin || selfState.lastAnchor || selfState.anchorPos;
        
        if (origin) {
            let dx = targetState.predicted_pos.x - origin.x;
            // Nếu dùng fire_origin (đã ở trong sọ), không nâng Y. Ngược lại nâng lên 1.5m
            let dy = targetState.predicted_pos.y - (payload.fire_origin ? origin.y : origin.y + 1.5); 
            let dz = targetState.predicted_pos.z - origin.z;
            const mag = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (mag > 0) perfectDir = { x: dx/mag, y: dy/mag, z: dz/mag };
        }

        if (perfectDir && payload.bullet_events && Array.isArray(payload.bullet_events)) {
            for (let i = 0; i < payload.bullet_events.length; i++) {
                let bullet = payload.bullet_events[i];
                bullet.ray_dir = { ...perfectDir };
                bullet.target_id = targetState.id;
                if (bullet.collision_obstacle !== undefined) bullet.collision_obstacle = false;
                if (bullet.is_penetrating !== undefined) bullet.is_penetrating = true;
            }
        }

        // ====================================================================
        // 4. CHRONOS TIMESTAMP & GHOST PENETRATION (V85 MERGE)
        // ====================================================================
        if (payload.damage_report || payload.hit_event) {
            let report = payload.damage_report || payload.hit_event;
            
            report.target_id = targetState.id;
            report.hit_bone = 8; // Cưỡng chế Headshot
            report.is_headshot = true;
            
            // Ép tọa độ vật lý khớp tuyệt đối với tọa độ Backtrack của M4
            report.hit_pos = { ...targetState.predicted_pos };
            if (report.ray_dir && perfectDir) report.ray_dir = { ...perfectDir };

            // [V85 KẾ THỪA] - GHOST PENETRATION (XUYÊN PHÁ MA THUẬT)
            if (report.distance_penalty !== undefined) report.distance_penalty = 0.0;
            if (report.armor_penetration !== undefined) report.armor_penetration = 1.0;
            if (report.ignore_armor !== undefined) report.ignore_armor = true; // Đặc quyền V85
            if (report.penetration_ratio !== undefined) report.penetration_ratio = 1.0; // Đục mọi vật liệu

            // [V85 KẾ THỪA] - CHRONOS TIMESTAMP SYNC (THAO TÚNG THỜI GIAN)
            // Lùi đồng hồ báo cáo sát thương lại một khoảng tương đương Ping thực tế.
            // Điều này ép Server Anti-Cheat phải ghi nhận pha bắn là Hợp Lệ trong quá khứ,
            // triệt tiêu hoàn toàn tỷ lệ lỗi Ghost Hit.
            if (report.client_timestamp !== undefined) {
                report.client_timestamp -= (ping * 0.45);
            }
        }

        return payload;
    }
}

// ============================================================================
// BỘ ĐIỀU PHỐI TỔNG (MATRIX DISPATCHER V2.6 - FINAL)
// Bản vá: Trích xuất Ping động, Xóa Node an toàn (Chống Null Reference Crash)
// ============================================================================
class MatrixDispatcher {
    
    // [BẢN VÁ 4]: LỌC DỮ LIỆU AN TOÀN (ANTI-CRASH SANITIZER)
    sanitizeTelemetry(obj) {
        if (!obj || typeof obj !== 'object') return obj;

        const blacklistedKeywords = ['report', 'hackkill', 'cheat', 'telemetry', 'exception', 'T_31_', 'T_33_', 'T_34_'];
        const keys = Object.keys(obj);
        
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const lowerKey = key.toLowerCase();

            if (blacklistedKeywords.some(keyword => lowerKey.includes(keyword))) {
                // Dùng lệnh 'delete' để cắt đứt hoàn toàn Node khỏi bộ nhớ,
                // thay vì gán null gây lỗi Null Reference Exception cho C++ Engine.
                delete obj[key]; 
                continue;
            }

            if (obj[key] && typeof obj[key] === 'object') {
                obj[key] = this.sanitizeTelemetry(obj[key]);
            }
        }
        return obj;
    }

    processPayload(payload) {
        if (!payload) return payload;

        // [BẢN VÁ 3]: CẬP NHẬT PING ĐỘNG (DYNAMIC LATENCY TRACKER)
        // Lắng nghe và trích xuất độ trễ mạng thực tế để M4 tính toán điểm rơi chuẩn xác
        if (payload.ping !== undefined) {
            _global.__OmniState.currentPing = payload.ping;
        } else if (payload.network && payload.network.latency !== undefined) {
            _global.__OmniState.currentPing = payload.network.latency;
        }

        // BƯỚC 0: Tẩy rửa gói tin (Anti-Report)
        payload = this.sanitizeTelemetry(payload);

        // BƯỚC 1: Cập nhật Trạng thái vũ khí
        payload = WeaponClassifier.processWeaponState(payload);

        if (_global.__OmniState.weaponProfile && _global.__OmniState.weaponProfile.Core !== "IGNORE") {
            
            // BƯỚC 2: Mắt Thần (Cần Ping động để tính toán thời gian)
            payload = TargetKinematics.processTargetState(payload);

            // BƯỚC 3: Điều hướng Camera (Kèm Aim-Step và Y-Axis Breakaway)
            payload = CameraManipulator.execute(payload);

            // BƯỚC 4: Trigger Check (Bóp cò tự động nếu cần)
            payload = TriggerCheck.evaluate(payload);

            // BƯỚC 5: Đóng băng bệ phóng (ABS)
            payload = SelfKinematics.processSelfState(payload);

            // BƯỚC 6: Triệt tiêu Vật lý thô (Chỉ xóa Recoil/Spread, không tính toán Raycast nữa)
            const core = _global.__OmniState.weaponProfile.Core;
            if (core === "SHOTGUN") payload = ShotgunCore.execute(payload);
            else if (core === "AUTO") payload = AutoCore.execute(payload);
            else if (core === "ONETAP") payload = OneTapCore.execute(payload);

            // BƯỚC 7: Ma thuật Không gian (Gánh toàn bộ việc bẻ tia đạn và Hitbox)
            payload = MagicBulletCore.execute(payload);
        }

        // Định tuyến đệ quy
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

        return payload;
    }
}

// ============================================================================
// KÍCH HOẠT SHADOWROCKET LAYER 7 INTERCEPTOR
// ============================================================================
if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"weapon"') !== -1 || $response.body.indexOf('"report"') !== -1 || $response.body.indexOf('T_33_') !== -1) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new MatrixDispatcher().processPayload(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body }); 
        }
    } else {
        $done({ body: $response.body });
    }
}
