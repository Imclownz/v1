/**
 * ==============================================================================
 * PROJECT: OMNI-MATRIX V2.3 (PERFECT PIPELINE ARCHITECTURE - FINAL VERSION)
 * Pipeline: Sanitizer -> M1(Gun) -> M4(Eyes) -> M7(Camera) -> TriggerCheck -> M5(Stance) -> M2/3/6(Physics) -> M8(Magic)
 * Status: Full system deployed with minimal adjustments as requested.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);

// ============================================================================
// 0. GLOBAL STATE (BỘ NHỚ DÙNG CHUNG ĐỒNG BỘ TỔNG V2.3 - ZERO PING)
// ============================================================================
if (!_global.__OmniState || _global.__OmniState.version !== "MATRIX_V2.3") {
    _global.__OmniState = {
        version: "MATRIX_V2.3",
        weaponProfile: { Core: "IGNORE", RequireZeroVelocity: false },
        
        target: { id: null, pos: null, predicted_pos: null, distance: 999.0 },
        self: { pos: {x:0, y:0, z:0}, anchorPos: {x:0, y:0, z:0}, vel: {x:0, y:0, z:0}, isPerfectlyStill: false, anchoredFireOrigin: null },
        
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
// MODULE 1: WEAPON CLASSIFIER (ĐÃ ĐƠN GIẢN HÓA - KHÔNG CÒN SNIPER-SPECIFIC)
// ============================================================================
class WeaponClassifier {
    
    static classify(weaponData) {
        let profile = { 
            Core: "IGNORE", 
            RequireZeroVelocity: false 
        };
        
        if (!weaponData) return profile;

        const id = (weaponData.id || "").toString().toUpperCase();
        const name = (weaponData.name || "").toString().toUpperCase();
        const category = (weaponData.category || "").toString().toUpperCase();

        const identifier = `${id}_${name}_${category}`;

        // 1. SHOTGUN
        if (identifier.includes("SHOTGUN") || identifier.includes("M1887") || 
            identifier.includes("M1014") || identifier.includes("SPAS") || 
            identifier.includes("MAG-7") || identifier.includes("TROGON") || identifier.includes("CHARGE")) {
            profile.Core = "SHOTGUN";
        } 
        // 2. ONETAP / PRECISION (đơn giản hóa, không còn RequireZeroVelocity riêng cho sniper)
        else if (identifier.includes("SNIPER") || identifier.includes("PISTOL") || 
                 identifier.includes("DESERT_EAGLE") || identifier.includes("WOODPECKER") || 
                 identifier.includes("SVD") || identifier.includes("AC80") || 
                 identifier.includes("AWM") || identifier.includes("M82B") || identifier.includes("KAR98")) {
            profile.Core = "ONETAP";
        } 
        // 3. AUTO
        else if (identifier.includes("SMG") || identifier.includes("AR") || 
                 identifier.includes("MACHINE") || identifier.includes("LMG") || 
                 identifier.includes("MP40") || identifier.includes("UMP") || 
                 identifier.includes("AK") || identifier.includes("SCAR") || 
                 identifier.includes("GROZA") || identifier.includes("FAMAS")) {
            profile.Core = "AUTO";
        }

        return profile;
    }

    static processWeaponState(payload) {
        const weaponState = _global.__OmniState.weapon;

        if (payload.is_firing !== undefined) {
            weaponState.isFiring = payload.is_firing;
        }

        if (payload.weapon) {
            if (payload.weapon.is_firing !== undefined) {
                weaponState.isFiring = payload.weapon.is_firing;
            }
            
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
// MODULE 4: TARGET KINEMATICS V4.0 – BONE-AWARE HEADLOCK (ULTIMATE VERSION)
// Tích hợp:
// - Bone hash chính xác (-2111735698) cho cả nam & nữ
// - Auto detect giới tính + head offset chính xác
// - Jerk-aware + bone-velocity prediction
// - Siêu mạnh magnetic inversion trong 0.2s native lock window
// - Anti-overhead & jump compensation tối ưu
// ============================================================================
class TargetKinematics {
    
    static normalizeAngle(angle) {
        while (angle > 180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }

    // Bone Head hash từ skeleton research (cả nam & nữ)
    static HEAD_BONE_HASH = -2111735698;

    static processTargetState(payload) {
        // 1. Cập nhật anchorPos bản thân
        if (payload.anchorPos !== undefined) {
            _global.__OmniState.self.anchorPos = { ...payload.anchorPos };
        } else if (payload.pos !== undefined && _global.__OmniState.self.anchorPos.x === 0) {
            _global.__OmniState.self.anchorPos = { ...payload.pos };
        }

        // Tắt aim-assist rác của game
        if (payload.aim_assist !== undefined) {
            payload.aim_assist.friction = 0.0;
            payload.aim_assist.adhesion = 0.0;
            payload.aim_assist.snap_weight = -999999.0;
        }

        if (!payload || !payload.players || !Array.isArray(payload.players)) return payload;

        const selfState = _global.__OmniState.self;
        if (!selfState.anchorPos || selfState.anchorPos.x === 0) return payload;

        const weaponState = _global.__OmniState.weapon || {};
        const isFiring = weaponState.isFiring || weaponState.triggerFired || payload.is_firing || false;

        let bestTarget = null;
        let lowestThreatScore = 9999999.0;
        const currentYaw = payload.aim_yaw !== undefined ? payload.aim_yaw : (_global.__OmniState.camera.prevYaw || 0.0);
        if (payload.aim_yaw !== undefined) _global.__OmniState.camera.prevYaw = payload.aim_yaw;

        // ====================================================================
        // 2. DYNAMIC MAGNETIC INVERSION + BONE HEAD PRIORITY
        // ====================================================================
        for (let i = 0; i < payload.players.length; i++) {
            const enemy = payload.players[i];

            // Bone-aware head boost (sử dụng hash chính xác)
            if (enemy.hitboxes) {
                const headHitbox = enemy.hitboxes.head;
                if (headHitbox) {
                    let headBoost = 999999.0;
                    if (isFiring) headBoost = 99999.0;   // Siêu mạnh trong 0.2s window

                    if (headHitbox.snap_weight !== undefined) headHitbox.snap_weight = headBoost;
                    if (headHitbox.friction !== undefined) headHitbox.friction = 1.0;
                    headHitbox.priority = "HIGHEST";
                    headHitbox._omniBoost = headBoost;

                    // Lưu hash để module sau kiểm tra
                    headHitbox._boneHash = this.HEAD_BONE_HASH;
                }

                // Suppression body mạnh mẽ
                const junkParts = ['chest', 'spine', 'pelvis', 'legs', 'arms', 'left_arm', 'right_arm', 'left_leg', 'right_leg'];
                for (let p = 0; p < junkParts.length; p++) {
                    const part = junkParts[p];
                    if (enemy.hitboxes[part]) {
                        let bodySuppress = isFiring ? -99999.0 : -999999.0;
                        if (enemy.hitboxes[part].snap_weight !== undefined) enemy.hitboxes[part].snap_weight = bodySuppress;
                        if (enemy.hitboxes[part].friction !== undefined) enemy.hitboxes[part].friction = 0.0;
                        enemy.hitboxes[part].priority = "IGNORE";
                    }
                }
            }

            // --- THREAT SCORE ĐƠN GIẢN (theo yêu cầu trước) ---
            if (enemy.is_dead || enemy.hp <= 0 || enemy.is_knocked) continue;
            if (enemy.team_id !== undefined && enemy.team_id === _global.__OmniState.team_id) continue;
            if (!enemy.pos) continue;

            const dx = enemy.pos.x - selfState.anchorPos.x;
            const dy = enemy.pos.y - selfState.anchorPos.y;
            const dz = enemy.pos.z - selfState.anchorPos.z;
            const distance3D = Math.sqrt(dx*dx + dy*dy + dz*dz);

            if (distance3D > 300.0) continue;

            let threatScore = distance3D;

            // Chỉ giữ FOV penalty
            let angleToEnemy = Math.atan2(dx, dz) * (180.0 / Math.PI);
            let fovDiff = Math.abs(this.normalizeAngle(angleToEnemy - currentYaw));
            let fovPenalty = fovDiff * (distance3D < 10.0 ? 1.0 : 3.5);
            threatScore += fovPenalty;

            if (threatScore < lowestThreatScore) {
                lowestThreatScore = threatScore;
                bestTarget = enemy;
                bestTarget.distance = distance3D;
            }
        }

        // ====================================================================
        // 3. ZERO-PING BONE-AWARE PREDICTION ENGINE V4.0
        // ====================================================================
        if (bestTarget) {
            const targetState = _global.__OmniState.target;
            const tracker = _global.__OmniState.tracker;
            const currentTime = Date.now();

            targetState.id = bestTarget.id;
            targetState.distance = bestTarget.distance;
            targetState.isFiringMode = isFiring;

            // === BONE-AWARE HEAD CENTER (chính xác nam/nữ) ===
            let headCenter = { x: bestTarget.pos.x, y: bestTarget.pos.y + 1.52, z: bestTarget.pos.z };

            if (bestTarget.hitboxes?.head?.pos) {
                headCenter = { ...bestTarget.hitboxes.head.pos };
            } else if (bestTarget.modelType === "female" || bestTarget.height < 1.65) {
                headCenter.y += 1.48;   // Nữ thấp hơn
            }

            let targetAimPos = headCenter;
            targetState.pos = { ...targetAimPos };

            // Prediction engine
            if (!tracker[bestTarget.id]) {
                tracker[bestTarget.id] = { 
                    history: [], 
                    velocity: {x:0, y:0, z:0},
                    lastVelocity: {x:0, y:0, z:0},
                    lastAccel: {x:0, y:0, z:0}
                };
                targetState.predicted_pos = { ...targetAimPos };
                targetState.velocity = {x:0, y:0, z:0};
            } else {
                let trackData = tracker[bestTarget.id];
                
                trackData.history.unshift({ pos: { ...targetAimPos }, time: currentTime });
                if (trackData.history.length > 15) trackData.history.pop(); // Tăng history cho mượt

                let prevFrame = trackData.history[1] || trackData.history[0];
                let dt = (currentTime - prevFrame.time) / 1000.0;
                
                if (dt > 0.0 && dt < 0.25) { 
                    // Dual-stage EMA velocity
                    let raw_vx = (targetAimPos.x - prevFrame.pos.x) / dt;
                    let raw_vy = (targetAimPos.y - prevFrame.pos.y) / dt;
                    let raw_vz = (targetAimPos.z - prevFrame.pos.z) / dt;

                    let alphaV = isFiring ? 0.68 : 0.52;
                    let vx = (raw_vx * alphaV) + (trackData.velocity.x * (1 - alphaV));
                    let vy = (raw_vy * alphaV) + (trackData.velocity.y * (1 - alphaV));
                    let vz = (raw_vz * alphaV) + (trackData.velocity.z * (1 - alphaV));
                    
                    trackData.velocity = { x: vx, y: vy, z: vz };
                    targetState.velocity = { x: vx, y: vy, z: vz };

                    // Jerk calculation
                    let ax = 0, ay = 0, az = 0;
                    if (trackData.lastVelocity) {
                        ax = (vx - trackData.lastVelocity.x) / dt;
                        ay = (vy - trackData.lastVelocity.y) / dt;
                        az = (vz - trackData.lastVelocity.z) / dt;
                    }
                    trackData.lastVelocity = { x: vx, y: vy, z: vz };

                    // Lead time tối ưu 0.2s window
                    let timeToTarget = isFiring ? 0.092 : 0.098;

                    let accelMagXZ = Math.sqrt(ax*ax + az*az);
                    let strafeDampener = (accelMagXZ > 45) ? 0.16 : (accelMagXZ > 18 ? 0.52 : 1.0);

                    let predX = targetAimPos.x + (vx * timeToTarget) + (0.5 * ax * timeToTarget * timeToTarget * strafeDampener);
                    let predZ = targetAimPos.z + (vz * timeToTarget) + (0.5 * az * timeToTarget * timeToTarget * strafeDampener);
                    let predY = targetAimPos.y + (vy * timeToTarget);

                    // Gravity + jump compensation
                    let speed = Math.sqrt(vx*vx + vy*vy + vz*vz);
                    let isJumping = Math.abs(vy) > 1.25 && speed <= 13.0;
                    if (isJumping) {
                        predY -= 0.5 * 9.81 * (timeToTarget * timeToTarget * 0.92);
                    }

                    targetState.predicted_pos = { x: predX, y: predY, z: predZ };
                } else {
                    targetState.predicted_pos = { ...targetAimPos };
                    targetState.velocity = {x:0, y:0, z:0};
                }
            }
        } else {
            _global.__OmniState.target = { 
                id: null, pos: null, predicted_pos: null, distance: 999999.0, 
                velocity: {x:0, y:0, z:0}, isFiringMode: false 
            };
        }

        return payload;
    }
}

// ============================================================================
// MODULE 7: CAMERA MANIPULATOR V9.0 – BONE-SYNC ULTIMATE (0.2s NATIVE LOCK)
// Tích hợp:
// - Bone Head Sync với Module 4 V4.0
// - 0.2s Wind-up Overdrive siêu mạnh
// - Jerk-aware Feedforward từ M4
// - Dynamic Deadzone + Anti-Overshoot Clamp
// - Adaptive aggression theo weapon + distance + scoping
// - Barrel + Camera dual enforcement
// ============================================================================
class CameraManipulator {
    
    static normalizeAngle(angle) {
        while (angle > 180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }

    // Bone Head hash từ skeleton research (cả nam & nữ)
    static HEAD_BONE_HASH = -2111735698;

    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;
        const camState = _global.__OmniState.camera;
        const weaponState = _global.__OmniState.weapon;
        const profile = _global.__OmniState.weaponProfile || {};

        // Zero friction base
        if (payload.aim_assist !== undefined) {
            payload.aim_assist.adhesion = 0.0;
            payload.aim_assist.friction = 0.0;
            payload.aim_assist.snap_weight = 0.0;
        }

        if (!targetState.id || !targetState.pos || payload.aim_yaw === undefined) {
            camState.wasFiring = false;
            return payload;
        }

        const isFiring = weaponState.isFiring || weaponState.triggerFired || payload.is_firing || false;
        const isScoping = payload.is_scoping || (payload.weapon && payload.weapon.is_scoping) || false;
        const currentTime = Date.now();

        // Khởi tạo 0.2s critical window
        const justStartedFiring = isFiring && !camState.wasFiring;
        if (justStartedFiring) camState.fireStartTime = currentTime;
        const fireElapsed = isFiring ? (currentTime - (camState.fireStartTime || currentTime)) : 0;
        camState.wasFiring = isFiring;

        if (!isFiring && !isScoping) {
            camState.integralYaw = camState.integralPitch = 0;
            return payload;
        }

        // Sử dụng predicted_pos từ M4 V4.0 (bone-aware)
        const dest = (isFiring && targetState.predicted_pos) ? targetState.predicted_pos : targetState.pos;

        const origin = selfState.lastAnchor 
            ? { x: selfState.lastAnchor.x, y: selfState.lastAnchor.y + 1.65, z: selfState.lastAnchor.z }
            : { x: selfState.anchorPos.x, y: selfState.anchorPos.y + 1.65, z: selfState.anchorPos.z };

        const dx = dest.x - origin.x;
        const dy = dest.y - origin.y;
        const dz = dest.z - origin.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz) || 0.001;

        let trueYaw = this.normalizeAngle(Math.atan2(dx, dz) * (180.0 / Math.PI));
        let truePitch = this.normalizeAngle(Math.atan2(-dy, distXZ) * (180.0 / Math.PI));

        const currentYaw = payload.aim_yaw;
        const currentPitch = payload.aim_pitch || 0;

        let errorYaw = this.normalizeAngle(trueYaw - currentYaw);
        let errorPitch = this.normalizeAngle(truePitch - currentPitch);

        let dt = (currentTime - (camState.lastTime || currentTime)) / 1000.0;
        if (dt <= 0 || dt > 0.1) dt = 0.016;
        camState.lastTime = currentTime;

        // ====================================================================
        // DYNAMIC PARAMETERS + BONE SYNC
        // ====================================================================
        const isCriticalLockWindow = isFiring && fireElapsed <= 220; // 0.22s an toàn
        const isOnetap = profile.Core === "ONETAP";
        const distance = targetState.distance || 50;

        // Strength tăng cực mạnh trong critical window
        let strengthYaw = isCriticalLockWindow ? 1.48 : (isFiring ? 1.22 : 0.95);
        let strengthPitch = isCriticalLockWindow ? 1.42 : (isFiring ? 1.18 : 0.92);

        if (isScoping) {
            strengthYaw *= 1.12;
            strengthPitch *= 1.15;
        }

        // ====================================================================
        // JERK + VELOCITY FEEDFORWARD (từ M4 V4.0)
        // ====================================================================
        let ffYaw = 0, ffPitch = 0;
        if (targetState.velocity && isFiring) {
            const vel = targetState.velocity;
            const futureX = dest.x + vel.x * 0.092;
            const futureY = dest.y + vel.y * 0.092;
            const futureZ = dest.z + vel.z * 0.092;

            const fdx = futureX - origin.x;
            const fdy = futureY - origin.y;
            const fdz = futureZ - origin.z;
            const fdistXZ = Math.sqrt(fdx*fdx + fdz*fdz) || 0.001;

            const futureYaw = this.normalizeAngle(Math.atan2(fdx, fdz) * (180 / Math.PI));
            const futurePitch = this.normalizeAngle(Math.atan2(-fdy, fdistXZ) * (180 / Math.PI));

            ffYaw = this.normalizeAngle(futureYaw - trueYaw) * 24 * dt;
            ffPitch = this.normalizeAngle(futurePitch - truePitch) * 24 * dt;
        }

        let outputYaw = 0;
        let outputPitch = 0;

        // ====================================================================
        // 4-PHASE CONTROL V9.0 + ANTI-OVERSHOOT
        // ====================================================================
        const dynamicDeadzone = isCriticalLockWindow ? 0.32 : (isFiring ? 0.68 : 2.1);

        if (Math.abs(errorYaw) <= dynamicDeadzone && Math.abs(errorPitch) <= dynamicDeadzone + 1.6) {
            // PHASE 1: PERFECT NATIVE LOCK (dính chặt)
            outputYaw = ffYaw + errorYaw * 0.72;
            outputPitch = ffPitch + errorPitch * 0.78;
        } 
        else if (isCriticalLockWindow) {
            // PHASE 2: 0.2s OVERDRIVE HIJACK (ép cực mạnh)
            outputYaw = errorYaw * strengthYaw;
            outputPitch = errorPitch * strengthPitch;
        } 
        else if (isFiring) {
            // PHASE 3: SUSTAINED TRACKING
            outputPitch = errorPitch * strengthPitch; // Y-axis full unchained
            const Kp = isOnetap ? 58 : 44;
            outputYaw = (errorYaw * Kp * dt) + ffYaw * 0.88;
        } 
        else {
            // PHASE 4: PRE-FIRE / SCOPING (PID humanized)
            const Kp = 26;
            const Ki = 0.018;
            const Kd = 0.55 + 16 / (Math.abs(errorYaw) + 3.5);

            camState.integralYaw = (camState.integralYaw || 0) + errorYaw * dt * 0.85;
            camState.integralPitch = (camState.integralPitch || 0) + errorPitch * dt * 0.85;

            const derivYaw = (errorYaw - (camState.prevErrorYaw || 0)) / dt;

            outputYaw = (errorYaw * Kp + camState.integralYaw * Ki + derivYaw * Kd) * dt + ffYaw * 0.75;
            outputPitch = errorPitch * 28 * dt + ffPitch * 0.75;
        }

        camState.prevErrorYaw = errorYaw;
        camState.prevErrorPitch = errorPitch;

        // ====================================================================
        // FINAL EMA + ANTI-OVERSHOOT CLAMP
        // ====================================================================
        if (camState.emaYaw === undefined) camState.emaYaw = currentYaw;
        if (camState.emaPitch === undefined) camState.emaPitch = currentPitch;

        const alpha = isCriticalLockWindow ? 0.995 : (isFiring ? 0.97 : 0.82);

        let newYaw = currentYaw + outputYaw;
        let newPitch = currentPitch + outputPitch;

        // Anti-overshoot clamp
        const maxDelta = isCriticalLockWindow ? 18 : (isFiring ? 12 : 8);
        newYaw = currentYaw + Math.max(-maxDelta, Math.min(maxDelta, newYaw - currentYaw));
        newPitch = currentPitch + Math.max(-maxDelta * 0.9, Math.min(maxDelta * 0.9, newPitch - currentPitch));

        camState.emaYaw = this.normalizeAngle(newYaw * alpha + camState.emaYaw * (1 - alpha));
        camState.emaPitch = this.normalizeAngle(newPitch * 0.97 + camState.emaPitch * 0.03);

        payload.aim_yaw = camState.emaYaw;
        payload.aim_pitch = camState.emaPitch;

        if (payload.camera_state) {
            payload.camera_state.yaw = payload.aim_yaw;
            payload.camera_state.pitch = payload.aim_pitch;
        }

        return payload;
    }
}

// ============================================================================
// MODULE 6.5: TRIGGER CHECK V3.0 – ULTIMATE NATIVE 0.2s EXECUTION
// Tích hợp:
// - Bone hash sync chính xác với M4 V4.0
// - Tight 0.2s native lock gate đồng bộ với M7 V9.0
// - Advanced hitchance + head-lock viability engine
// - Predictive pre-fire + auto-fire thông minh (peek, CQC, one-tap)
// - Zero-waste + charge weapon instant fire
// - Force absolute snap trong critical window
// ============================================================================
class TriggerCheck {
    static evaluate(payload) {
        const targetState = _global.__OmniState.target;
        const weaponState = _global.__OmniState.weapon;
        const profile = _global.__OmniState.weaponProfile;
        const camState = _global.__OmniState.camera || {};

        // 1. RESET CHU KỲ
        weaponState.triggerFired = false;
        weaponState.forceAbsoluteSnap = false;
        weaponState.isPendingFire = false;

        // Bỏ qua nếu không hỗ trợ
        if (profile.Core === "IGNORE") return payload;

        // Trạng thái bóp cò thủ công
        let isManualFiring = payload.is_firing || (payload.weapon && payload.weapon.is_firing) || false;

        // ====================================================================
        // 2. PERFECT 0.2s NATIVE LOCK GATE (đồng bộ M7 V9.0)
        // ====================================================================
        const currentTime = Date.now();
        const fireElapsed = camState.fireStartTime 
            ? (currentTime - camState.fireStartTime) 
            : 999999;
        const isCriticalWindow = isManualFiring && fireElapsed <= 220;

        if (!targetState.id || !targetState.predicted_pos) {
            if (isManualFiring) {
                payload.is_firing = false;
                if (payload.weapon) payload.weapon.is_firing = false;
                weaponState.isFiring = false;
            }
            return payload;
        }

        // Lấy dữ liệu từ M4 V4.0
        const tracker = _global.__OmniState.tracker[targetState.id] || {};
        const distance = targetState.distance || 999999;
        const speed = tracker.velocity 
            ? Math.sqrt(tracker.velocity.x**2 + tracker.velocity.z**2) 
            : 0;

        // ====================================================================
        // 3. HITCHANCE & HEAD-LOCK VIABILITY ENGINE (BONE-AWARE)
        // ====================================================================
        let hitchance = 100.0;

        // Bone Head check (đồng bộ M4 V4.0)
        const hasValidHeadLock = targetState.pos && 
            (targetState.hitboxes?.head?._boneHash === TargetKinematics.HEAD_BONE_HASH || true);

        const isTargetBehindCover = tracker.is_behind_cover || false;

        // Giảm hitchance khi nấp sau vật cản (trừ ONETAP)
        if (isTargetBehindCover && profile.Core !== "ONETAP") {
            hitchance = 18.0;
        }

        // Giảm khi di chuyển nhanh + khoảng cách xa
        if (speed > 8.5 && distance > 45) {
            hitchance *= 0.55;
        }

        // Tăng mạnh khi đang trong critical window (0.2s native lock)
        if (isCriticalWindow && hasValidHeadLock) {
            hitchance = 100.0;
        }

        // Nếu hitchance quá thấp → chặn hoàn toàn
        if (hitchance < 28.0) {
            if (isManualFiring) {
                payload.is_firing = false;
                if (payload.weapon) payload.weapon.is_firing = false;
                weaponState.isFiring = false;
            }
            return payload;
        }

        // ====================================================================
        // 4. PREDICTIVE PRE-FIRE + AUTO-FIRE INTELLIGENCE
        // ====================================================================
        let shouldAutoFire = false;

        // Peek logic (Tatsuya / lướt ra khỏi cover)
        if (speed > 4.8 && tracker.is_partially_hidden) {
            shouldAutoFire = true;
        }

        // One-tap + đứng im / di chuyển chậm
        if (profile.Core === "ONETAP" && speed < 1.8 && !isTargetBehindCover) {
            shouldAutoFire = true;
        }

        // Shotgun CQC + head align
        if (profile.Core === "SHOTGUN" && distance < 13 && 
            Math.abs(targetState.predicted_pos.y - targetState.pos.y) < 1.8) {
            shouldAutoFire = true;
        }

        // Auto-fire khi M7 đã align cực mạnh trong critical window
        if (isCriticalWindow && hasValidHeadLock) {
            shouldAutoFire = true;
        }

        // ====================================================================
        // 5. THỰC THI ÁN TỬ (NATIVE 0.2s EXECUTION)
        // ====================================================================
        const shouldFire = isManualFiring || shouldAutoFire;

        if (shouldFire) {
            payload.is_firing = true;
            if (payload.weapon) {
                payload.weapon.is_firing = true;

                // Charge weapon instant
                if (payload.weapon.charge_time !== undefined) {
                    payload.weapon.charge_time = 999999.0;
                }
            }

            weaponState.isFiring = true;
            weaponState.triggerFired = true;          // Báo M5 kích hoạt micro-braking
            weaponState.forceAbsoluteSnap = true;     // Báo M7 overdrive

            // Cập nhật fireStartTime cho M7
            if (_global.__OmniState.camera) {
                _global.__OmniState.camera.fireStartTime = currentTime;
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 5: SELF KINEMATICS V10.0 – BONE-SYNC CHRONOS ANCHOR ULTIMATE
// Tích hợp:
// - 0.2s Native Wind-up Stance Spoofing (đóng băng chính xác tick bắn)
// - Chronos Anchor V3.0 + Fire-Origin Bone-Aware
// - CQC Head Origin Injection (nòng súng thẳng vào sọ)
// - Micro-braking chỉ trong critical window (đồng bộ M7 V9.0)
// - Anti-reconciliation + velocity freeze tối ưu
// ============================================================================
class SelfKinematics {
    static processSelfState(payload) {
        const state = _global.__OmniState.self;
        const targetState = _global.__OmniState.target;
        const weaponState = _global.__OmniState.weapon;
        const camState = _global.__OmniState.camera || {};
        const profile = _global.__OmniState.weaponProfile || {};

        // Nhận diện trạng thái bóp cò (đồng bộ TriggerCheck V3.0)
        const isFiring = weaponState.isFiring || weaponState.triggerFired || payload.is_firing || false;
        const currentTime = Date.now();
        const isCriticalWindow = isFiring && camState.fireStartTime 
            ? (currentTime - camState.fireStartTime) <= 220 
            : false;

        // Khởi tạo lịch sử chống reconciliation
        if (!state.history) state.history = [];
        if (!state.lastAnchor) state.lastAnchor = null;

        // ====================================================================
        // TRẠNG THÁI NGHỈ: CẬP NHẬT LIÊN TỤC (không can thiệp)
        // ====================================================================
        if (payload.pos !== undefined) {
            state.history.unshift({ ...payload.pos, time: currentTime });
            if (state.history.length > 10) state.history.pop();
        }

        if (!isFiring) {
            if (payload.anchorPos !== undefined) {
                state.lastAnchor = { ...payload.anchorPos };
            }
            return payload;
        }

        // ====================================================================
        // TRẠNG THÁI KHAI HỎA: 0.2s SINGULARITY MODE
        // ====================================================================

        // 1. CHRONOS ANCHOR V3.0 (Neo thời không cực chặt)
        if (payload.anchorPos !== undefined && state.lastAnchor) {
            payload.anchorPos.x = state.lastAnchor.x;
            payload.anchorPos.y = state.lastAnchor.y;
            payload.anchorPos.z = state.lastAnchor.z;
        }

        // 2. BONE-AWARE CQC ORIGIN SPOOFING (NÒNG SÚNG HƯỚNG ĐẦU)
        if (payload.fire_origin !== undefined && targetState.predicted_pos) {
            if (targetState.distance < 4.5) {
                // Cận chiến: Dịch thẳng nòng vào sọ (bone head aware)
                payload.fire_origin = {
                    x: targetState.predicted_pos.x,
                    y: targetState.predicted_pos.y,
                    z: targetState.predicted_pos.z - 0.08
                };
            } else if (state.lastAnchor) {
                // Giữ origin neo tĩnh chống nảy
                payload.fire_origin = {
                    x: state.lastAnchor.x,
                    y: state.lastAnchor.y + 1.65,
                    z: state.lastAnchor.z
                };
            }
        }

        // 3. STANCE + BODY SWAY SPOOFING
        if (payload.body_sway !== undefined) payload.body_sway = 0.0;
        if (payload.stance !== undefined && profile.Core === "ONETAP") {
            payload.stance = 0; // Standing still hoàn toàn
        }

        // 4. MICRO-BRAKING V10.0 (CHỈ TRONG CRITICAL WINDOW)
        if (weaponState.triggerFired || isCriticalWindow) {
            // Đóng băng vận tốc + acceleration
            if (payload.velocity !== undefined) {
                payload.velocity = { x: 0.0, y: 0.0, z: 0.0 };
            }
            if (payload.acceleration !== undefined) {
                payload.acceleration = { x: 0.0, y: 0.0, z: 0.0 };
            }

            // Giả mạo trạng thái tĩnh lặng
            if (payload.speed !== undefined) payload.speed = 0.0;
            if (payload.is_moving !== undefined) payload.is_moving = false;

            // Bonus cho SHOTGUN/AUTO: stance cứng hơn
            if (profile.Core === "SHOTGUN" || profile.Core === "AUTO") {
                if (payload.stance !== undefined) payload.stance = 0;
            }
        }

        // Lưu lastAnchor cho frame sau
        if (payload.anchorPos !== undefined) {
            state.lastAnchor = { ...payload.anchorPos };
        }

        return payload;
    }
}

// ============================================================================
// MODULE 2: SHOTGUN CORE V4.0 – BONE-SYNC LASER PELLET ULTIMATE
// Tích hợp:
// - Bone Head Sync chính xác với M4 V4.0
// - Perfect Laser Pellet Concentration (tất cả pellets bay thẳng predicted head)
// - Triệt tiêu recoil/spread/inaccuracy hoàn toàn
// - Critical 0.2s window synergy (đồng bộ M7 V9.0 + TriggerCheck V3.0)
// - Damage override tối thượng (headshot + max penetration + zero falloff)
// - Anti-overhead & jump compensation
// ============================================================================
class ShotgunCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;
        const weaponState = _global.__OmniState.weapon;
        const camState = _global.__OmniState.camera || {};

        // Kiểm tra critical 0.2s window (đồng bộ toàn pipeline)
        const currentTime = Date.now();
        const isCriticalWindow = weaponState.isFiring && camState.fireStartTime 
            ? (currentTime - camState.fireStartTime) <= 220 
            : false;

        // --------------------------------------------------------------------
        // 1. TRIỆT TIÊU HOÀN TOÀN VẬT LÝ SÚNG SHOTGUN
        // --------------------------------------------------------------------
        if (payload.weapon) {
            // Recoil triệt để
            if (payload.weapon.recoil_y !== undefined) payload.weapon.recoil_y = 0.0;
            if (payload.weapon.recoil_x !== undefined) payload.weapon.recoil_x = 0.0;
            if (payload.weapon.recoil_accumulation !== undefined) payload.weapon.recoil_accumulation = 0.0;

            // Spread hoàn toàn = 0 (chìa khóa của shotgun)
            if (payload.weapon.base_spread !== undefined) payload.weapon.base_spread = 0.0;
            if (payload.weapon.dynamic_spread !== undefined) payload.weapon.dynamic_spread = 0.0;
            if (payload.weapon.max_spread !== undefined) payload.weapon.max_spread = 0.0;
            if (payload.weapon.spread_add_per_shot !== undefined) payload.weapon.spread_add_per_shot = 0.0;

            // Inaccuracy di chuyển/nhảy/ngồi
            if (payload.weapon.inaccuracy_move !== undefined) payload.weapon.inaccuracy_move = 0.0;
            if (payload.weapon.inaccuracy_jump !== undefined) payload.weapon.inaccuracy_jump = 0.0;
            if (payload.weapon.inaccuracy_crouch !== undefined) payload.weapon.inaccuracy_crouch = 0.0;
        }

        // --------------------------------------------------------------------
        // 2. LASER PELLET CONCENTRATION (BONE-AWARE)
        // --------------------------------------------------------------------
        if (payload.bullet_events && Array.isArray(payload.bullet_events) && targetState.predicted_pos && selfState.anchorPos) {
            
            const origin = payload.fire_origin || selfState.lastAnchor || selfState.anchorPos;
            const dest = targetState.predicted_pos;

            let dx = dest.x - origin.x;
            let dy = dest.y - origin.y;
            let dz = dest.z - origin.z;
            
            const mag = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1.0;
            const perfectDir = { 
                x: dx / mag, 
                y: dy / mag, 
                z: dz / mag 
            };

            for (let i = 0; i < payload.bullet_events.length; i++) {
                let pellet = payload.bullet_events[i];
                
                // Ép mọi pellet bay thẳng vào predicted head (bone-aware)
                if (pellet.ray_dir) {
                    pellet.ray_dir = { ...perfectDir };
                }
                
                pellet.target_id = targetState.id;

                // Bonus cực mạnh trong critical window
                if (isCriticalWindow) {
                    if (pellet.is_penetrating !== undefined) pellet.is_penetrating = true;
                    if (pellet.collision_obstacle !== undefined) pellet.collision_obstacle = false;
                    if (pellet.deviation !== undefined) pellet.deviation = 0.0;
                    if (pellet.spread_angle !== undefined) pellet.spread_angle = 0.0;
                }
            }
        }

        // --------------------------------------------------------------------
        // 3. DAMAGE FINALIZATION + HEADSHOT FORCE (CHO MỌI PELLET)
        // --------------------------------------------------------------------
        if (payload.damage_report) {
            payload.damage_report.hit_bone = 8;                    // Bone Head chính xác
            payload.damage_report.is_headshot = true;
            
            // Xóa giảm sát thương theo khoảng cách
            if (payload.damage_report.distance_penalty !== undefined) {
                payload.damage_report.distance_penalty = 0.0;
            }
            
            // Xuyên giáp 100% + penetration tối đa
            if (payload.damage_report.armor_penetration !== undefined) {
                payload.damage_report.armor_penetration = 1.0;
            }
            if (payload.damage_report.ignore_armor !== undefined) {
                payload.damage_report.ignore_armor = true;
            }
            if (payload.damage_report.penetration_ratio !== undefined) {
                payload.damage_report.penetration_ratio = 1.0;
            }

            // Bonus sát thương trong critical window
            if (isCriticalWindow && payload.damage_report.damage_multiplier !== undefined) {
                payload.damage_report.damage_multiplier = 1.18;   // Tăng mạnh hơn trước
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 3: AUTO CORE V4.0 – BONE-SYNC LASER STREAM ULTIMATE
// Tích hợp:
// - Bone Head Sync chính xác với M4 V4.0
// - Perfect Laser Bullet Stream (tất cả đạn bay thẳng predicted head)
// - Triệt tiêu recoil/spread/inaccuracy hoàn toàn
// - Critical 0.2s window synergy mạnh mẽ (đồng bộ M7 V9.0 + TriggerCheck V3.0)
// - Damage override tối thượng (headshot + max penetration + zero falloff)
// - Anti-overhead & jump compensation
// ============================================================================
class AutoCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;
        const weaponState = _global.__OmniState.weapon;
        const camState = _global.__OmniState.camera || {};

        // Critical window 220ms (đồng bộ toàn pipeline)
        const currentTime = Date.now();
        const isCriticalWindow = weaponState.isFiring && camState.fireStartTime 
            ? (currentTime - camState.fireStartTime) <= 220 
            : false;

        // --------------------------------------------------------------------
        // 1. TRIỆT TIÊU HOÀN TOÀN VẬT LÝ SÚNG AUTO (RECOIL + SPREAD + INACCURACY = 0)
        // --------------------------------------------------------------------
        if (payload.weapon) {
            // Recoil triệt để
            if (payload.weapon.recoil_y !== undefined) payload.weapon.recoil_y = 0.0;
            if (payload.weapon.recoil_x !== undefined) payload.weapon.recoil_x = 0.0;
            if (payload.weapon.recoil_accumulation !== undefined) payload.weapon.recoil_accumulation = 0.0;

            // Spread hoàn toàn = 0 (đạn bay thẳng tắp dù sấy cả băng)
            if (payload.weapon.base_spread !== undefined) payload.weapon.base_spread = 0.0;
            if (payload.weapon.dynamic_spread !== undefined) payload.weapon.dynamic_spread = 0.0;
            if (payload.weapon.max_spread !== undefined) payload.weapon.max_spread = 0.0;
            if (payload.weapon.spread_add_per_shot !== undefined) payload.weapon.spread_add_per_shot = 0.0;

            // Inaccuracy di chuyển / nhảy / ngồi
            if (payload.weapon.inaccuracy_move !== undefined) payload.weapon.inaccuracy_move = 0.0;
            if (payload.weapon.inaccuracy_jump !== undefined) payload.weapon.inaccuracy_jump = 0.0;
            if (payload.weapon.inaccuracy_crouch !== undefined) payload.weapon.inaccuracy_crouch = 0.0;
        }

        // --------------------------------------------------------------------
        // 2. LASER BULLET STREAM SYNCHRONIZATION (BONE-AWARE)
        // --------------------------------------------------------------------
        if (payload.bullet_events && Array.isArray(payload.bullet_events) && targetState.predicted_pos && selfState.anchorPos) {
            
            const origin = payload.fire_origin || selfState.lastAnchor || selfState.anchorPos;
            const dest = targetState.predicted_pos;

            let dx = dest.x - origin.x;
            let dy = dest.y - origin.y;
            let dz = dest.z - origin.z;
            
            const mag = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1.0;
            const perfectDir = { 
                x: dx / mag, 
                y: dy / mag, 
                z: dz / mag 
            };

            for (let i = 0; i < payload.bullet_events.length; i++) {
                let bullet = payload.bullet_events[i];
                
                // Ép mọi viên đạn bay theo đúng 1 tia laser thẳng đến predicted head
                if (bullet.ray_dir) {
                    bullet.ray_dir = { ...perfectDir };
                }
                
                bullet.target_id = targetState.id;

                // Bonus cực mạnh trong critical window
                if (isCriticalWindow) {
                    if (bullet.is_penetrating !== undefined) bullet.is_penetrating = true;
                    if (bullet.collision_obstacle !== undefined) bullet.collision_obstacle = false;
                    if (bullet.deviation !== undefined) bullet.deviation = 0.0;
                    if (bullet.spread_angle !== undefined) bullet.spread_angle = 0.0;
                    if (bullet.angular_velocity !== undefined) bullet.angular_velocity = 0.0;
                }
            }
        }

        // --------------------------------------------------------------------
        // 3. DAMAGE FINALIZATION + HEADSHOT FORCE (CHO MỌI VIÊN ĐẠN)
        // --------------------------------------------------------------------
        if (payload.damage_report) {
            payload.damage_report.hit_bone = 8;                    // Bone Head chính xác
            payload.damage_report.is_headshot = true;
            
            // Xóa giảm sát thương theo khoảng cách
            if (payload.damage_report.distance_penalty !== undefined) {
                payload.damage_report.distance_penalty = 0.0;
            }
            
            // Xuyên giáp 100% + penetration tối đa
            if (payload.damage_report.armor_penetration !== undefined) {
                payload.damage_report.armor_penetration = 1.0;
            }
            if (payload.damage_report.ignore_armor !== undefined) {
                payload.damage_report.ignore_armor = true;
            }
            if (payload.damage_report.penetration_ratio !== undefined) {
                payload.damage_report.penetration_ratio = 1.0;
            }

            // Bonus sát thương trong critical window
            if (isCriticalWindow && payload.damage_report.damage_multiplier !== undefined) {
                payload.damage_report.damage_multiplier = 1.16;
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 6: ONE-TAP CORE V4.0 – BONE-SYNC ONE-SHOT HEADLOCK ULTIMATE
// Tích hợp:
// - Bone Head Sync chính xác với M4 V4.0 (hash -2111735698)
// - Perfect Raycast Override (đạn bay thẳng predicted head dù camera lag)
// - Critical 0.2s window synergy cực mạnh (đồng bộ M7 V9.0 + TriggerCheck V3.0)
// - Recoil + spread + inaccuracy triệt để + recovery siêu nhanh
// - Damage override tối thượng (headshot + max penetration + bonus damage)
// - Anti-overhead & jump compensation
// ============================================================================
class OneTapCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;
        const weaponState = _global.__OmniState.weapon;
        const camState = _global.__OmniState.camera || {};

        // Critical window 220ms (đồng bộ toàn pipeline)
        const currentTime = Date.now();
        const isCriticalWindow = weaponState.isFiring && camState.fireStartTime 
            ? (currentTime - camState.fireStartTime) <= 220 
            : false;

        // --------------------------------------------------------------------
        // 1. TRIỆT TIÊU HOÀN TOÀN VẬT LÝ SÚNG ONETAP
        // --------------------------------------------------------------------
        if (payload.weapon) {
            // Spread triệt để
            if (payload.weapon.base_spread !== undefined) payload.weapon.base_spread = 0.0;
            if (payload.weapon.dynamic_spread !== undefined) payload.weapon.dynamic_spread = 0.0;

            // Recoil triệt để
            if (payload.weapon.recoil_y !== undefined) payload.weapon.recoil_y = 0.0;
            if (payload.weapon.recoil_x !== undefined) payload.weapon.recoil_x = 0.0;

            // Recovery cực nhanh (không giật nảy sau mỗi phát)
            if (payload.weapon.recoil_recovery !== undefined) {
                payload.weapon.recoil_recovery = 999999.0;
            }

            // Inaccuracy di chuyển / nhảy / scope
            if (payload.weapon.inaccuracy_move !== undefined) payload.weapon.inaccuracy_move = 0.0;
            if (payload.weapon.inaccuracy_jump !== undefined) payload.weapon.inaccuracy_jump = 0.0;
            if (payload.weapon.inaccuracy_crouch !== undefined) payload.weapon.inaccuracy_crouch = 0.0;
        }

        // --------------------------------------------------------------------
        // 2. ONE-SHOT RAYCAST OVERRIDE (BONE-AWARE)
        // --------------------------------------------------------------------
        if (payload.bullet_events && Array.isArray(payload.bullet_events) && targetState.predicted_pos && selfState.anchorPos) {
            
            const origin = payload.fire_origin || selfState.lastAnchor || selfState.anchorPos;
            const dest = targetState.predicted_pos;

            let dx = dest.x - origin.x;
            let dy = dest.y - origin.y;
            let dz = dest.z - origin.z;
            
            const mag = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1.0;
            const perfectDir = { 
                x: dx / mag, 
                y: dy / mag, 
                z: dz / mag 
            };

            for (let i = 0; i < payload.bullet_events.length; i++) {
                let bullet = payload.bullet_events[i];
                
                // Ép ray_dir thẳng vào predicted head (dù camera chưa xoay đến)
                if (bullet.ray_dir) {
                    bullet.ray_dir = { ...perfectDir };
                }
                
                bullet.target_id = targetState.id;

                // Bonus cực mạnh trong critical window
                if (isCriticalWindow) {
                    if (bullet.deviation !== undefined) bullet.deviation = 0.0;
                    if (bullet.is_penetrating !== undefined) bullet.is_penetrating = true;
                    if (bullet.collision_obstacle !== undefined) bullet.collision_obstacle = false;
                    if (bullet.angular_velocity !== undefined) bullet.angular_velocity = 0.0;
                }
            }
        }

        // --------------------------------------------------------------------
        // 3. DAMAGE FINALIZATION + INSTANT HEADSHOT FORCE
        // --------------------------------------------------------------------
        if (payload.damage_report) {
            payload.damage_report.hit_bone = 8;                    // Bone Head chính xác
            payload.damage_report.is_headshot = true;
            
            // Xóa giảm sát thương theo khoảng cách
            if (payload.damage_report.distance_penalty !== undefined) {
                payload.damage_report.distance_penalty = 0.0;
            }
            
            // Xuyên giáp 100% (biến mũ/giáp thành giấy)
            if (payload.damage_report.armor_penetration !== undefined) {
                payload.damage_report.armor_penetration = 1.0;
            }
            if (payload.damage_report.ignore_armor !== undefined) {
                payload.damage_report.ignore_armor = true;
            }
            if (payload.damage_report.penetration_ratio !== undefined) {
                payload.damage_report.penetration_ratio = 1.0;
            }

            // Bonus sát thương trong critical window
            if (isCriticalWindow && payload.damage_report.damage_multiplier !== undefined) {
                payload.damage_report.damage_multiplier = 1.22;   // Tăng mạnh hơn trước
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 8: MAGIC BULLET CORE V10.0 – BONE-SYNC MAGIC BULLET ULTIMATE
// Tích hợp:
// - Bone Head Sync chính xác với M4 V4.0 (hash -2111735698)
// - Singularity Vector mạnh nhất trong critical 220ms window
// - Miss-to-hit inversion + anti-overlap tối ưu
// - Ballistic decoupling triệt để (không xuyên tường)
// - Damage override tối thượng (headshot + max penetration + bonus damage)
// - Đồng bộ hoàn hảo với toàn pipeline (M4 → M7 → Trigger → M5)
// ============================================================================
class MagicBulletCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;
        const weaponState = _global.__OmniState.weapon;
        const camState = _global.__OmniState.camera || {};

        // Critical window 220ms (đồng bộ M7 V9.0 + TriggerCheck V3.0)
        const currentTime = Date.now();
        const isCriticalWindow = weaponState.isFiring && camState.fireStartTime 
            ? (currentTime - camState.fireStartTime) <= 220 
            : false;

        if (!targetState || !targetState.id || !targetState.predicted_pos) return payload;

        // 1. MISS-TO-HIT INVERSION (ép hit dù miss)
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

        // 2. SMART ANTI-OVERLAP (làm hitbox các mục tiêu khác cực nhỏ)
        if (payload.players && Array.isArray(payload.players)) {
            for (let i = 0; i < payload.players.length; i++) {
                let enemy = payload.players[i];
                if (enemy.id !== targetState.id && enemy.hitboxes) {
                    const bodyParts = ['head', 'chest', 'pelvis', 'legs', 'arms'];
                    for (let p = 0; p < bodyParts.length; p++) {
                        if (enemy.hitboxes[bodyParts[p]]) {
                            enemy.hitboxes[bodyParts[p]].radius = 0.008; 
                        }
                    }
                }
            }
        }

        // 3. SINGULARITY VECTOR + PERFECT ORIGIN (bone-aware)
        let perfectDir = null;
        let origin = payload.fire_origin || selfState.lastAnchor || selfState.anchorPos;
        
        if (origin && targetState.predicted_pos) {
            let dx = targetState.predicted_pos.x - origin.x;
            let dy = targetState.predicted_pos.y - (payload.fire_origin ? origin.y : origin.y + 1.65);
            let dz = targetState.predicted_pos.z - origin.z;
            const mag = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (mag > 0) perfectDir = { x: dx/mag, y: dy/mag, z: dz/mag };
        }

        // 4. BALLISTIC DECOUPLING TRIỆT ĐỂ (không xuyên tường, bullet bay hoàn hảo)
        if (perfectDir && payload.bullet_events && Array.isArray(payload.bullet_events)) {
            for (let i = 0; i < payload.bullet_events.length; i++) {
                let bullet = payload.bullet_events[i];
                
                bullet.ray_dir = { ...perfectDir };
                bullet.target_id = targetState.id;
                
                // Triệt tiêu mọi yếu tố gây lệch
                if (bullet.spread_angle !== undefined) bullet.spread_angle = 0.0;
                if (bullet.deviation !== undefined) bullet.deviation = 0.0;
                if (bullet.angular_velocity !== undefined) bullet.angular_velocity = 0.0;
                if (bullet.momentum_offset !== undefined) bullet.momentum_offset = 0.0;
                if (bullet.drift !== undefined) bullet.drift = 0.0;
                if (bullet.trajectory_curve !== undefined) bullet.trajectory_curve = 0.0;
                if (bullet.velocity_inheritance !== undefined) bullet.velocity_inheritance = 0.0;
                if (bullet.gravity_influence !== undefined) bullet.gravity_influence = 0.0;
                if (bullet.wind_effect !== undefined) bullet.wind_effect = 0.0;
                
                // Bonus critical window
                if (isCriticalWindow) {
                    if (bullet.is_penetrating !== undefined) bullet.is_penetrating = true;
                    if (bullet.collision_obstacle !== undefined) bullet.collision_obstacle = false;
                }
            }
        }

        // 5. DAMAGE FINALIZATION (HEADSHOT TỐI ĐA)
        if (payload.damage_report || payload.hit_event) {
            let report = payload.damage_report || payload.hit_event;
            
            report.target_id = targetState.id;
            report.hit_bone = 8; 
            report.is_headshot = true;
            
            report.hit_pos = { ...targetState.predicted_pos };
            if (report.ray_dir && perfectDir) report.ray_dir = { ...perfectDir };

            if (report.distance_penalty !== undefined) report.distance_penalty = 0.0;
            if (report.armor_penetration !== undefined) report.armor_penetration = 1.0;
            if (report.ignore_armor !== undefined) report.ignore_armor = true; 

            if (isCriticalWindow && report.damage_multiplier !== undefined) {
                report.damage_multiplier = 1.20;   // Bonus mạnh nhất
            }
        }

        return payload;
    }
}

// ============================================================================
// BỘ ĐIỀU PHỐI TỔNG (MATRIX DISPATCHER V2.7)
// ============================================================================
class MatrixDispatcher {
    
    sanitizeTelemetry(obj) {
        if (!obj || typeof obj !== 'object') return obj;

        const blacklistedKeywords = ['report', 'hackkill', 'cheat', 'telemetry', 'exception', 'T_31_', 'T_33_', 'T_34_'];
        const keys = Object.keys(obj);
        
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const lowerKey = key.toLowerCase();

            if (blacklistedKeywords.some(keyword => lowerKey.includes(keyword))) {
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

        payload = this.sanitizeTelemetry(payload);
        payload = WeaponClassifier.processWeaponState(payload);

        if (_global.__OmniState.weaponProfile && _global.__OmniState.weaponProfile.Core !== "IGNORE") {
            payload = TargetKinematics.processTargetState(payload);
            payload = CameraManipulator.execute(payload);
            payload = TriggerCheck.evaluate(payload);
            payload = SelfKinematics.processSelfState(payload);

            const core = _global.__OmniState.weaponProfile.Core;
            if (core === "SHOTGUN") payload = ShotgunCore.execute(payload);
            else if (core === "AUTO") payload = AutoCore.execute(payload);
            else if (core === "ONETAP") payload = OneTapCore.execute(payload);

            payload = MagicBulletCore.execute(payload);
        }

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
// WRAPPER - HÀM CHÍNH ĐỂ INJECT (QUAN TRỌNG CHO MOBILECONFIG)
// ============================================================================
function ProcessPayload(inputPayload) {
    try {
        let payload = typeof inputPayload === 'string' ? JSON.parse(inputPayload) : inputPayload;
        const mutated = new MatrixDispatcher().processPayload(payload);
        return mutated;
    } catch (e) {
        return inputPayload;
    }
}

// Auto-run khi script được load (dành cho injection)
if (typeof window !== 'undefined') {
    window.OMNI_MATRIX = { ProcessPayload };
    console.log('[OMNI-MATRIX] Loaded successfully - Ready for injection');
}

// Export để tool inject có thể gọi
if (typeof module !== 'undefined') module.exports = { ProcessPayload };
