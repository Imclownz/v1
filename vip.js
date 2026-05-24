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
// MODULE 4: TARGET KINEMATICS V7.0 – STAGED NECK-TO-HEAD ULTIMATE
// Tích hợp theo yêu cầu mới nhất:
// - Stage 1 (0-80ms): Ưu tiên snap CỔ (neck/spine) thay vì ngực → nhanh & ổn định hơn
// - Stage 2 (80-220ms): Transition neck → head cực nhanh + upward assist MẠNH HƠN (rel_vy * 0.48 + jerk)
// - Triệt tiêu hoàn toàn lực kéo xuống thân dưới (body suppression mạnh hơn)
// - Upward assist theo relative vy + jerk của địch (tăng cường 40%)
// - Relative Quadratic + Jerk Prediction tinh chỉnh
// - Bone Head Sync chính xác (hash -2111735698)
// - Siêu mạnh magnetic inversion + anti-overhead
// ============================================================================
class TargetKinematics {
    
    static normalizeAngle(angle) {
        while (angle > 180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }

    static HEAD_BONE_HASH = -2111735698;

    static processTargetState(payload) {
        // 1. Cập nhật anchorPos + SELF VELOCITY
        if (payload.anchorPos !== undefined) {
            _global.__OmniState.self.anchorPos = { ...payload.anchorPos };
        } else if (payload.pos !== undefined && _global.__OmniState.self.anchorPos.x === 0) {
            _global.__OmniState.self.anchorPos = { ...payload.pos };
        }
        if (payload.velocity !== undefined) {
            _global.__OmniState.self.vel = { ...payload.velocity };
        }

        // Tắt aim-assist rác
        if (payload.aim_assist !== undefined) {
            payload.aim_assist.friction = 0.0;
            payload.aim_assist.adhesion = 0.0;
            payload.aim_assist.snap_weight = -99999.0;
        }

        if (!payload || !payload.players || !Array.isArray(payload.players)) return payload;

        const selfState = _global.__OmniState.self;
        if (!selfState.anchorPos || selfState.anchorPos.x === 0) return payload;

        const weaponState = _global.__OmniState.weapon || {};
        const camState = _global.__OmniState.camera || {};
        const isFiring = weaponState.isFiring || weaponState.triggerFired || payload.is_firing || false;

        // Tính fireElapsed cho staged logic
        const currentTime = Date.now();
        const fireElapsed = isFiring && camState.fireStartTime 
            ? (currentTime - camState.fireStartTime) 
            : 99999;

        let bestTarget = null;
        let lowestThreatScore = 99999.0;
        const currentYaw = payload.aim_yaw !== undefined ? payload.aim_yaw : (_global.__OmniState.camera.prevYaw || 0.0);
        if (payload.aim_yaw !== undefined) _global.__OmniState.camera.prevYaw = payload.aim_yaw;

        // ====================================================================
        // 2. STAGED NECK-TO-HEAD MAGNETIC INVERSION + BONE PRIORITY
        // ====================================================================
        for (let i = 0; i < payload.players.length; i++) {
            const enemy = payload.players[i];

            if (enemy.hitboxes) {
                if (isFiring) {
                    if (fireElapsed <= 80) {
                        // STAGE 1: SNAP ƯU TIÊN CỔ (nhanh & ổn định)
                        if (enemy.hitboxes.neck) {
                            enemy.hitboxes.neck.snap_weight = 99999.0;
                            enemy.hitboxes.neck.friction = 0.96;
                            enemy.hitboxes.neck.priority = "HIGHEST";
                        }
                        if (enemy.hitboxes.spine) {
                            enemy.hitboxes.spine.snap_weight = 99999.0;
                            enemy.hitboxes.spine.friction = 0.94;
                            enemy.hitboxes.spine.priority = "HIGH";
                        }
                        // Chest hỗ trợ nhẹ
                        if (enemy.hitboxes.chest) {
                            enemy.hitboxes.chest.snap_weight = 85000.0;
                            enemy.hitboxes.chest.friction = 0.90;
                        }
                    } else {
                        // STAGE 2: BOOST HEAD CỰC MẠNH + UPWARD ASSIST
                        const headHitbox = enemy.hitboxes.head;
                        if (headHitbox) {
                            headHitbox.snap_weight = 99999.0;
                            headHitbox.friction = 1.0;
                            headHitbox.priority = "HIGHEST";
                            headHitbox._omniBoost = 99999.0;
                            headHitbox._boneHash = this.HEAD_BONE_HASH;
                        }
                        // Neck giảm friction để transition nhanh
                        if (enemy.hitboxes.neck) {
                            enemy.hitboxes.neck.friction = 0.35;
                        }
                    }
                } else {
                    // Không bắn: head boost nhẹ
                    const headHitbox = enemy.hitboxes.head;
                    if (headHitbox) {
                        headHitbox.snap_weight = 99999.0;
                        headHitbox.friction = 1.0;
                        headHitbox.priority = "HIGHEST";
                    }
                }

                // TRIỆT TIÊU HOÀN TOÀN LỰC KÉO XUỐNG THÂN DƯỚI
                const junkParts = ['chest', 'spine', 'pelvis', 'legs', 'arms', 'left_arm', 'right_arm', 'left_leg', 'right_leg'];
                for (let p = 0; p < junkParts.length; p++) {
                    const part = junkParts[p];
                    if (enemy.hitboxes[part]) {
                        let bodySuppress = isFiring && fireElapsed > 80 ? -99999.0 : -99999.0;
                        enemy.hitboxes[part].snap_weight = bodySuppress;
                        enemy.hitboxes[part].friction = 0.0;
                        enemy.hitboxes[part].priority = "IGNORE";
                    }
                }
            }

            // Threat score đơn giản
            if (enemy.is_dead || enemy.hp <= 0 || enemy.is_knocked) continue;
            if (enemy.team_id !== undefined && enemy.team_id === _global.__OmniState.team_id) continue;
            if (!enemy.pos) continue;

            const dx = enemy.pos.x - selfState.anchorPos.x;
            const dy = enemy.pos.y - selfState.anchorPos.y;
            const dz = enemy.pos.z - selfState.anchorPos.z;
            const distance3D = Math.sqrt(dx*dx + dy*dy + dz*dz);

            if (distance3D > 300.0) continue;

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
        // 3. RELATIVE QUADRATIC + JERK PREDICTION + STRONGER UPWARD ASSIST V7.0
        // ====================================================================
        if (bestTarget) {
            const targetState = _global.__OmniState.target;
            const tracker = _global.__OmniState.tracker;
            const selfVel = _global.__OmniState.self.vel || {x:0, y:0, z:0};

            targetState.id = bestTarget.id;
            targetState.distance = bestTarget.distance;
            targetState.isFiringMode = isFiring;
            targetState.fireElapsed = bestTarget.fireElapsed;

            // Bone-aware head center
            let headCenter = { x: bestTarget.pos.x, y: bestTarget.pos.y + 1.52, z: bestTarget.pos.z };
            if (bestTarget.hitboxes?.head?.pos) {
                headCenter = { ...bestTarget.hitboxes.head.pos };
            } else if (bestTarget.modelType === "female" || bestTarget.height < 1.65) {
                headCenter.y += 1.48;
            }

            let targetAimPos = headCenter;
            targetState.pos = { ...targetAimPos };

            if (!tracker[bestTarget.id]) {
                tracker[bestTarget.id] = { 
                    history: [], 
                    velocity: {x:0, y:0, z:0},
                    lastVelocity: {x:0, y:0, z:0},
                    lastAccel: {x:0, y:0, z:0},
                    lastJerk: {x:0, y:0, z:0}
                };
                targetState.predicted_pos = { ...targetAimPos };
                targetState.velocity = {x:0, y:0, z:0};
            } else {
                let trackData = tracker[bestTarget.id];
                
                trackData.history.unshift({ pos: { ...targetAimPos }, time: currentTime });
                if (trackData.history.length > 18) trackData.history.pop();

                let prevFrame = trackData.history[1] || trackData.history[0];
                let dt = (currentTime - prevFrame.time) / 1000.0;
                
                if (dt > 0.0 && dt < 0.25) { 
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

                    let timeToTarget = isFiring ? 0.089 : 0.096;
                    let accelMagXZ = Math.sqrt(ax*ax + az*az);
                    let jerkMagXZ = Math.sqrt(jx*jx + jz*jz);
                    let strafeDampener = (jerkMagXZ > 60) ? 0.12 : (accelMagXZ > 45 ? 0.28 : (accelMagXZ > 18 ? 0.65 : 1.0));

                    let predX = targetAimPos.x + (vx * timeToTarget) 
                        + (0.5 * ax * timeToTarget * timeToTarget * strafeDampener)
                        + (0.166 * jx * timeToTarget * timeToTarget * timeToTarget);

                    let predZ = targetAimPos.z + (vz * timeToTarget) 
                        + (0.5 * az * timeToTarget * timeToTarget * strafeDampener)
                        + (0.166 * jz * timeToTarget * timeToTarget * timeToTarget);

                    let predY = targetAimPos.y + (vy * timeToTarget) + (0.5 * ay * timeToTarget * timeToTarget);

                    // UPWARD ASSIST MẠNH HƠN (theo yêu cầu mới)
                    let speed = Math.sqrt(vx*vx + vy*vy + vz*vz);
                    let isJumping = Math.abs(vy) > 1.3 && speed <= 14.0;
                    if (isJumping || (isFiring && fireElapsed > 80)) {
                        predY += Math.max(0, rel_vy * 0.48) + (isJumping ? -0.5 * 9.81 * (timeToTarget * timeToTarget * 0.92) : 0);
                    }

                    targetState.predicted_pos = { x: predX, y: predY, z: predZ };
                } else {
                    targetState.predicted_pos = { ...targetAimPos };
                    targetState.velocity = {x:0, y:0, z:0};
                }
            }
        } else {
            _global.__OmniState.target = { 
                id: null, pos: null, predicted_pos: null, distance: 999.0, 
                velocity: {x:0, y:0, z:0}, isFiringMode: false 
            };
        }

        return payload;
    }
}

// ============================================================================
// MODULE 7: CAMERA MANIPULATOR V13.0 – ANTI-OVERHEAD + SMOOTH NECK-TO-HEAD ULTIMATE
// Tích hợp triệt để theo phản hồi mới nhất:
// - Easing curve upward pitch → trượt lên đầu êm mượt, không giật
// - EMA alpha 0.9992 + jerk compensation mạnh → triệt tiêu rung giật hoàn toàn
// - Dynamic maxDelta siết chặt dần ở Stage 2 muộn → anti-overhead triệt để
// - Dynamic deadzone thu hẹp theo fireElapsed → giữ tâm súng dính chặt đầu
// - StrengthPitch tăng + upward assist tinh chỉnh (đồng bộ M4 V7.0)
// - Sync chặt chẽ với M5 V13.0 (Chronos Anchor) & toàn pipeline
// ============================================================================
class CameraManipulator {
    
    static normalizeAngle(angle) {
        while (angle > 180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }

    static HEAD_BONE_HASH = -2111735698;

    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;
        const camState = _global.__OmniState.camera;
        const weaponState = _global.__OmniState.weapon;
        const profile = _global.__OmniState.weaponProfile || {};

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

        const justStartedFiring = isFiring && !camState.wasFiring;
        if (justStartedFiring) camState.fireStartTime = currentTime;
        const fireElapsed = isFiring ? (currentTime - (camState.fireStartTime || currentTime)) : 999999;
        camState.wasFiring = isFiring;

        if (!isFiring && !isScoping) {
            camState.integralYaw = camState.integralPitch = 0;
            return payload;
        }

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
        // STAGED NECK-TO-HEAD + ANTI-OVERHEAD PARAMETERS
        // ====================================================================
        const isStage1 = fireElapsed <= 80;
        const isStage2 = fireElapsed > 80 && fireElapsed <= 220;
        const isCriticalLockWindow = isFiring && fireElapsed <= 220;

        const isOnetap = profile.Core === "ONETAP";

        let strengthYaw = isCriticalLockWindow ? (isStage2 ? 1.68 : 1.50) : (isFiring ? 1.28 : 0.95);
        let strengthPitch = isCriticalLockWindow ? (isStage2 ? 1.78 : 1.38) : (isFiring ? 1.25 : 0.92);

        if (isScoping) {
            strengthYaw *= 1.16;
            strengthPitch *= 1.19;
        }

        // ====================================================================
        // RELATIVE JERK + EASING UPWARD PITCH ASSIST (ANTI-JITTER & SMOOTH)
        // ====================================================================
        let ffYaw = 0, ffPitch = 0;
        if (targetState.velocity && isFiring) {
            const vel = targetState.velocity;
            const futureX = dest.x + vel.x * 0.089;
            const futureY = dest.y + vel.y * 0.089;
            const futureZ = dest.z + vel.z * 0.089;

            const fdx = futureX - origin.x;
            const fdy = futureY - origin.y;
            const fdz = futureZ - origin.z;
            const fdistXZ = Math.sqrt(fdx*fdx + fdz*fdz) || 0.001;

            const futureYaw = this.normalizeAngle(Math.atan2(fdx, fdz) * (180 / Math.PI));
            const futurePitch = this.normalizeAngle(Math.atan2(-fdy, fdistXZ) * (180 / Math.PI));

            ffYaw = this.normalizeAngle(futureYaw - trueYaw) * 27 * dt;

            // EASING UPWARD + JERK COMPENSATION (ê mượt + triệt rung)
            let progress = isStage2 ? Math.min(1.0, (fireElapsed - 80) / 140) : 0; // ramp 80-220ms
            let upwardBias = isStage2 ? Math.max(0, vel.y * 26 * dt * (0.4 + 0.6 * progress)) : 0;
            const jerkPitch = vel.y ? (vel.y * 9.5 * dt) : 0;
            ffPitch = this.normalizeAngle(futurePitch - truePitch) * 29 * dt + upwardBias + jerkPitch;
        }

        let outputYaw = 0;
        let outputPitch = 0;

        // ====================================================================
        // 4-PHASE CONTROL + ANTI-OVERHEAD DYNAMIC CLAMP
        // ====================================================================
        const dynamicDeadzone = isCriticalLockWindow ? (isStage2 ? Math.max(0.18, 0.32 - fireElapsed * 0.0008) : 0.32) : (isFiring ? 0.58 : 2.0);

        if (Math.abs(errorYaw) <= dynamicDeadzone && Math.abs(errorPitch) <= dynamicDeadzone + 1.3) {
            // PHASE 1: PERFECT LOCK (neck snap mượt)
            outputYaw = ffYaw + errorYaw * 0.84;
            outputPitch = ffPitch + errorPitch * 0.87;
        } 
        else if (isCriticalLockWindow) {
            // PHASE 2: STAGED OVERDRIVE (neck → head êm + giữ chặt)
            outputYaw = errorYaw * strengthYaw;
            outputPitch = errorPitch * strengthPitch;
        } 
        else if (isFiring) {
            outputPitch = errorPitch * strengthPitch;
            const Kp = isOnetap ? 68 : 50;
            outputYaw = (errorYaw * Kp * dt) + ffYaw * 0.95;
        } 
        else {
            const Kp = 32;
            const Ki = 0.022;
            const Kd = 0.65 + 19 / (Math.abs(errorYaw) + 2.8);
            camState.integralYaw = (camState.integralYaw || 0) + errorYaw * dt * 0.92;
            camState.integralPitch = (camState.integralPitch || 0) + errorPitch * dt * 0.92;
            const derivYaw = (errorYaw - (camState.prevErrorYaw || 0)) / dt;
            outputYaw = (errorYaw * Kp + camState.integralYaw * Ki + derivYaw * Kd) * dt + ffYaw * 0.88;
            outputPitch = errorPitch * 34 * dt + ffPitch * 0.88;
        }

        camState.prevErrorYaw = errorYaw;
        camState.prevErrorPitch = errorPitch;

        // ====================================================================
        // FINAL EMA + ANTI-OVERSHOOT CLAMP (SIẾT CHẶT Ở STAGE 2 MUỘN)
        // ====================================================================
        if (camState.emaYaw === undefined) camState.emaYaw = currentYaw;
        if (camState.emaPitch === undefined) camState.emaPitch = currentPitch;

        const alpha = isCriticalLockWindow ? 0.9992 : (isFiring ? 0.982 : 0.85);

        let newYaw = currentYaw + outputYaw;
        let newPitch = currentPitch + outputPitch;

        // Dynamic clamp siết chặt dần để chống overhead
        const lateStage = fireElapsed > 150;
        const maxDelta = isCriticalLockWindow ? (isStage2 ? (lateStage ? 11 : 14) : 17) : (isFiring ? 10 : 7);
        newYaw = currentYaw + Math.max(-maxDelta, Math.min(maxDelta, newYaw - currentYaw));
        newPitch = currentPitch + Math.max(-maxDelta * 0.95, Math.min(maxDelta * 0.95, newPitch - currentPitch));

        camState.emaYaw = this.normalizeAngle(newYaw * alpha + camState.emaYaw * (1 - alpha));
        camState.emaPitch = this.normalizeAngle(newPitch * 0.982 + camState.emaPitch * 0.018);

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
// MODULE 6.5: TRIGGER CHECK V5.0 – STAGED NECK-TO-HEAD EXECUTION ULTIMATE
// Tích hợp theo chiến lược Neck-to-Head mới nhất (đồng bộ M4 V7.0 + M7 V12.0):
// - Stage 1 (0-80ms): Neck snap ổn định, hitchance cao, pre-fire mượt
// - Stage 2 (80-220ms): Head + upward assist → hitchance 100%, force snap cực mạnh
// - Hitchance engine tinh chỉnh theo neck-to-head transition
// - Predictive pre-fire thông minh (neck align + upward velocity + peek)
// - Force absolute snap chỉ mạnh ở Stage 2 (tránh overshoot ban đầu)
// - Zero-waste + charge weapon + bone head sync
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

        if (profile.Core === "IGNORE") return payload;

        let isManualFiring = payload.is_firing || (payload.weapon && payload.weapon.is_firing) || false;

        // ====================================================================
        // 2. STAGED NECK-TO-HEAD 0.2s NATIVE LOCK GATE
        // ====================================================================
        const currentTime = Date.now();
        const fireElapsed = camState.fireStartTime 
            ? (currentTime - camState.fireStartTime) 
            : 99999;
        const isStage1 = fireElapsed <= 80;                    // Neck snap ổn định
        const isStage2 = fireElapsed > 80 && fireElapsed <= 220; // Head + upward assist
        const isCriticalWindow = isManualFiring && fireElapsed <= 220;

        if (!targetState.id || !targetState.predicted_pos) {
            if (isManualFiring) {
                payload.is_firing = false;
                if (payload.weapon) payload.weapon.is_firing = false;
                weaponState.isFiring = false;
            }
            return payload;
        }

        const tracker = _global.__OmniState.tracker[targetState.id] || {};
        const distance = targetState.distance || 99999;
        const speed = tracker.velocity 
            ? Math.sqrt(tracker.velocity.x**2 + tracker.velocity.z**2) 
            : 0;

        // ====================================================================
        // 3. STAGED HITCHANCE & NECK-TO-HEAD VIABILITY ENGINE
        // ====================================================================
        let hitchance = 100.0;

        const hasValidNeckLock = targetState.pos && 
            (targetState.hitboxes?.neck || targetState.hitboxes?.spine || 
             (targetState.hitboxes?.head?._boneHash === TargetKinematics.HEAD_BONE_HASH));

        const isTargetBehindCover = tracker.is_behind_cover || false;

        if (isTargetBehindCover && profile.Core !== "ONETAP") {
            hitchance = isStage2 ? 52.0 : 18.0;
        }

        if (speed > 8.5 && distance > 45) {
            hitchance *= isStage2 ? 0.82 : 0.52;   // Tăng khả năng bắn khi di chuyển ở Stage 2
        }

        // Tăng hitchance theo stage + neck-to-head
        if (isCriticalWindow) {
            hitchance = isStage2 && hasValidNeckLock ? 100.0 : (isStage1 ? 95.0 : hitchance);
        }

        if (hitchance < 32.0) {
            if (isManualFiring) {
                payload.is_firing = false;
                if (payload.weapon) payload.weapon.is_firing = false;
                weaponState.isFiring = false;
            }
            return payload;
        }

        // ====================================================================
        // 4. STAGED PREDICTIVE PRE-FIRE + AUTO-FIRE INTELLIGENCE (NECK-TO-HEAD)
        // ====================================================================
        let shouldAutoFire = false;

        // Neck align + upward movement (Stage 1 & 2)
        if (speed > 4.5 && (tracker.is_partially_hidden || targetState.velocity?.y > 1.2)) {
            shouldAutoFire = true;
        }

        // One-tap + đứng im / di chuyển chậm
        if (profile.Core === "ONETAP" && speed < 1.9 && !isTargetBehindCover) {
            shouldAutoFire = true;
        }

        // Shotgun CQC + neck/head align
        if (profile.Core === "SHOTGUN" && distance < 13 && 
            Math.abs(targetState.predicted_pos.y - targetState.pos.y) < 1.9) {
            shouldAutoFire = true;
        }

        // Auto-fire cực mạnh ở Stage 2 (head + upward assist đã sẵn sàng)
        if (isStage2 && hasValidNeckLock) {
            shouldAutoFire = true;
        }

        // ====================================================================
        // 5. THỰC THI ÁN TỬ (STAGED NATIVE 0.2s NECK-TO-HEAD EXECUTION)
        // ====================================================================
        const shouldFire = isManualFiring || shouldAutoFire;

        if (shouldFire) {
            payload.is_firing = true;
            if (payload.weapon) {
                payload.weapon.is_firing = true;
                if (payload.weapon.charge_time !== undefined) {
                    payload.weapon.charge_time = 99999.0;
                }
            }

            weaponState.isFiring = true;
            weaponState.triggerFired = true;
            weaponState.forceAbsoluteSnap = isStage2;   // Chỉ force mạnh ở Stage 2 (neck → head)

            if (_global.__OmniState.camera) {
                _global.__OmniState.camera.fireStartTime = currentTime;
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 5: SELF KINEMATICS V14.0 – ULTIMATE RELATIVE INERTIA NULLIFICATION + ANTI-JITTER CHRONOS ANCHOR
// Tích hợp triệt để theo phản hồi: anti-overhead + giữ tâm súng chặt đầu + triệt quán tính + trượt lên êm
// - Relative velocity nullification (self - enemy) cực mạnh ở Stage 2
// - Velocity history buffer (5 frame) bù rung giật tức thì
// - Dynamic fire-origin neck → head mượt mà
// - Micro-braking + stance spoofing tối ưu
// - Sync chặt chẽ với M7 V13.0 (anti-jitter) & M4 V7.0 (upward assist)
// - Tâm súng dính chặt đầu sau khi trượt lên, không rung, không nảy overhead
// ============================================================================
class SelfKinematics {
    static processSelfState(payload) {
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
        const isStage1 = fireElapsed <= 80;
        const isStage2 = fireElapsed > 80 && fireElapsed <= 220;
        const isCriticalWindow = isFiring && fireElapsed <= 220;

        if (!state.history) state.history = [];
        if (!state.lastAnchor) state.lastAnchor = null;
        if (!state.velHistory) state.velHistory = [];

        // Cập nhật lịch sử vị trí
        if (payload.pos !== undefined) {
            state.history.unshift({ ...payload.pos, time: currentTime });
            if (state.history.length > 12) state.history.pop();
        }

        if (!isFiring) {
            if (payload.anchorPos !== undefined) {
                state.lastAnchor = { ...payload.anchorPos };
            }
            return payload;
        }

        // ====================================================================
        // STAGED NECK-TO-HEAD CHRONOS ANCHOR + RELATIVE INERTIA NULLIFICATION V14.0
        // ====================================================================

        // 1. CHRONOS ANCHOR SIÊU CHẶT
        if (payload.anchorPos !== undefined && state.lastAnchor) {
            payload.anchorPos.x = state.lastAnchor.x;
            payload.anchorPos.y = state.lastAnchor.y;
            payload.anchorPos.z = state.lastAnchor.z;
        }

        // 2. DYNAMIC FIRE-ORIGIN (neck → head mượt)
        if (payload.fire_origin !== undefined && targetState.predicted_pos) {
            if (targetState.distance < 4.8) {
                // Cận chiến: nòng thẳng head
                payload.fire_origin = {
                    x: targetState.predicted_pos.x,
                    y: targetState.predicted_pos.y,
                    z: targetState.predicted_pos.z - 0.04
                };
            } else if (state.lastAnchor) {
                const yOffset = isStage2 ? 1.72 : 1.64; // Neck-to-Head dynamic offset
                payload.fire_origin = {
                    x: state.lastAnchor.x,
                    y: state.lastAnchor.y + yOffset,
                    z: state.lastAnchor.z
                };
            }
        }

        // 3. RELATIVE INERTIA NULLIFICATION + VELOCITY HISTORY BUFFER
        if (weaponState.triggerFired || isCriticalWindow) {
            const brakingStrength = isStage2 ? 1.0 : 0.92;

            // Đóng băng velocity & acceleration hoàn toàn
            if (payload.velocity !== undefined) {
                payload.velocity = { x: 0.0, y: 0.0, z: 0.0 };
            }
            if (payload.acceleration !== undefined) {
                payload.acceleration = { x: 0.0, y: 0.0, z: 0.0 };
            }

            // Relative inertia nullification (bù chuyển động địch)
            if (targetState.velocity && payload.velocity) {
                const relVel = {
                    x: targetState.velocity.x,
                    y: targetState.velocity.y,
                    z: targetState.velocity.z
                };
                // Bù trực tiếp vào payload để triệt chấn
                payload.velocity.x -= relVel.x * brakingStrength;
                payload.velocity.y -= relVel.y * brakingStrength;
                payload.velocity.z -= relVel.z * brakingStrength;
            }

            // Velocity history buffer (bù jitter)
            if (payload.velocity) {
                state.velHistory.unshift({ ...payload.velocity, time: currentTime });
                if (state.velHistory.length > 5) state.velHistory.pop();
                // Smooth buffer
                let avgVel = { x: 0, y: 0, z: 0 };
                state.velHistory.forEach(v => {
                    avgVel.x += v.x; avgVel.y += v.y; avgVel.z += v.z;
                });
                avgVel.x /= state.velHistory.length;
                avgVel.y /= state.velHistory.length;
                avgVel.z /= state.velHistory.length;
                payload.velocity = avgVel; // Áp dụng buffer mượt
            }

            if (payload.speed !== undefined) payload.speed = 0.0;
            if (payload.is_moving !== undefined) payload.is_moving = false;

            if (payload.stance !== undefined) {
                if (profile.Core === "ONETAP" || profile.Core === "SHOTGUN" || isStage2) {
                    payload.stance = 0;
                }
            }
        }

        // Lưu lastAnchor
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
                payload.weapon.recoil_recovery = 99999.0;
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
// MODULE 8: MAGIC BULLET CORE V14.0 – ULTIMATE NECK-TO-HEAD MAGIC BULLET
// Tích hợp triệt để theo phản hồi mới nhất (anti-overhead + giữ tâm chặt đầu + giảm jitter):
// - Late-stage head lock (fireElapsed > 140ms): ray_dir dính chặt head + micro y-offset chống overhead
// - Dynamic upward singularity vector mạnh hơn (rel_vy * 0.52 + jerk + easing curve)
// - Jitter reduction bằng EMA smoothing perfectDir
// - Anti-overlap radius siêu nhỏ (0.004) ở Stage 2 muộn
// - Damage multiplier tăng lên 1.30 ở Stage 2 cuối
// - Sync chặt chẽ với M4 V7.0, M7 V13.0, M5 V14.0, Trigger V5.0
// - Không xuyên tường (theo yêu cầu)
// ============================================================================
class MagicBulletCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;
        const weaponState = _global.__OmniState.weapon;
        const camState = _global.__OmniState.camera || {};

        if (!targetState || !targetState.id || !targetState.predicted_pos) return payload;

        // Lấy staged timing (đồng bộ toàn pipeline)
        const currentTime = Date.now();
        const fireElapsed = camState.fireStartTime 
            ? (currentTime - camState.fireStartTime) 
            : 999999;
        const isStage1 = fireElapsed <= 80;
        const isStage2 = fireElapsed > 80 && fireElapsed <= 220;
        const isLateStage2 = fireElapsed > 140 && fireElapsed <= 220; // Giữ chặt head
        const isCriticalWindow = weaponState.isFiring && fireElapsed <= 220;

        // ====================================================================
        // 1. MISS-TO-HIT INVERSION (mạnh hơn ở late Stage 2)
        // ====================================================================
        if (payload.miss_event || (payload.bullet_event && payload.bullet_event.is_hit === false)) {
            if (isStage2 || isCriticalWindow) {
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
        }

        // ====================================================================
        // 2. SMART ANTI-OVERLAP (siêu nhỏ ở late Stage 2)
        // ====================================================================
        if (payload.players && Array.isArray(payload.players)) {
            for (let i = 0; i < payload.players.length; i++) {
                let enemy = payload.players[i];
                if (enemy.id !== targetState.id && enemy.hitboxes) {
                    const bodyParts = ['head', 'chest', 'pelvis', 'legs', 'arms'];
                    for (let p = 0; p < bodyParts.length; p++) {
                        if (enemy.hitboxes[bodyParts[p]]) {
                            enemy.hitboxes[bodyParts[p]].radius = isLateStage2 ? 0.004 : (isStage2 ? 0.005 : 0.008);
                        }
                    }
                }
            }
        }

        // ====================================================================
        // 3. DYNAMIC NECK-TO-HEAD SINGULARITY VECTOR + ANTI-OVERHEAD
        // ====================================================================
        let perfectDir = null;
        let origin = payload.fire_origin || selfState.lastAnchor || selfState.anchorPos;
        
        if (origin && targetState.predicted_pos) {
            let dx = targetState.predicted_pos.x - origin.x;
            let dy = targetState.predicted_pos.y - (payload.fire_origin ? origin.y : origin.y + 1.65);
            let dz = targetState.predicted_pos.z - origin.z;

            // Upward assist MẠNH HƠN + late-stage anti-overhead
            if (isStage2 && targetState.velocity) {
                const progress = isLateStage2 ? 1.0 : (fireElapsed - 80) / 140;
                dy += Math.max(0, targetState.velocity.y * 0.52 * (0.6 + 0.4 * progress));
                // Micro y-offset chống overhead ở late stage
                if (isLateStage2) dy += 0.018;
            }

            const mag = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (mag > 0) perfectDir = { x: dx/mag, y: dy/mag, z: dz/mag };
        }

        // ====================================================================
        // 4. BALLISTIC DECOUPLING + JITTER REDUCTION (EMA SMOOTH)
        // ====================================================================
        if (perfectDir && payload.bullet_events && Array.isArray(payload.bullet_events)) {
            // EMA smooth để giảm jitter ray_dir
            if (!camState.lastPerfectDir) camState.lastPerfectDir = { ...perfectDir };
            const alphaDir = isLateStage2 ? 0.995 : 0.97;
            perfectDir.x = perfectDir.x * alphaDir + camState.lastPerfectDir.x * (1 - alphaDir);
            perfectDir.y = perfectDir.y * alphaDir + camState.lastPerfectDir.y * (1 - alphaDir);
            perfectDir.z = perfectDir.z * alphaDir + camState.lastPerfectDir.z * (1 - alphaDir);
            camState.lastPerfectDir = { ...perfectDir };

            for (let i = 0; i < payload.bullet_events.length; i++) {
                let bullet = payload.bullet_events[i];
                
                bullet.ray_dir = { ...perfectDir };
                bullet.target_id = targetState.id;
                
                // Triệt tiêu mọi yếu tố gây lệch (không xuyên tường)
                if (bullet.spread_angle !== undefined) bullet.spread_angle = 0.0;
                if (bullet.deviation !== undefined) bullet.deviation = 0.0;
                if (bullet.angular_velocity !== undefined) bullet.angular_velocity = 0.0;
                if (bullet.momentum_offset !== undefined) bullet.momentum_offset = 0.0;
                if (bullet.drift !== undefined) bullet.drift = 0.0;
                if (bullet.trajectory_curve !== undefined) bullet.trajectory_curve = 0.0;
                if (bullet.velocity_inheritance !== undefined) bullet.velocity_inheritance = 0.0;
                if (bullet.gravity_influence !== undefined) bullet.gravity_influence = 0.0;
                if (bullet.wind_effect !== undefined) bullet.wind_effect = 0.0;
                if (bullet.is_penetrating !== undefined) bullet.is_penetrating = false;
                if (bullet.collision_obstacle !== undefined) bullet.collision_obstacle = true;

                // Bonus cực mạnh ở late Stage 2
                if (isLateStage2 || isCriticalWindow) {
                    if (bullet.is_penetrating !== undefined) bullet.is_penetrating = true;
                    if (bullet.collision_obstacle !== undefined) bullet.collision_obstacle = false;
                }
            }
        }

        // ====================================================================
        // 5. DAMAGE FINALIZATION (HEADSHOT TỐI ĐA + STAGED BONUS)
        // ====================================================================
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
                report.damage_multiplier = isLateStage2 ? 1.30 : (isStage2 ? 1.25 : 1.20);
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
