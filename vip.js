/**
 * ==============================================================================
 * PROJECT: OMNI-MATRIX V2.3 (PHASE 1 - FRAMEWORK + MODULE 1 DEPLOYED)
 * Pipeline: Sanitizer -> M1(Gun) -> [M4 Eyes] -> [M7 Camera] -> [TriggerCheck] -> [M5 Stance] -> [Physics Cores] -> [M8 Magic]
 * Status: Framework + Module 1 fully deployed. Ready for next modules.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);

// ============================================================================
// 0. GLOBAL STATE (BỘ NHỚ DÙNG CHUNG ĐỒNG BỘ TỔNG V2.3 - ZERO PING + CRITICAL WINDOW)
// ============================================================================
if (!_global.__OmniState || _global.__OmniState.version !== "MATRIX_V2.3") {
    _global.__OmniState = {
        version: "MATRIX_V2.3",
        
        // Profile vũ khí (đơn giản hóa chỉ còn 3 core)
        weaponProfile: { Core: "IGNORE", RequireZeroVelocity: false },
        
        // Target & Prediction
        target: { 
            id: null, 
            pos: null, 
            predicted_pos: null, 
            distance: 9999.0,
            velocity: {x:0, y:0, z:0},
            isFiringMode: false 
        },
        
        // Self state
        self: { 
            pos: {x:0, y:0, z:0}, 
            anchorPos: {x:0, y:0, z:0}, 
            lastAnchor: null,
            history: [],
            vel: {x:0, y:0, z:0} 
        },
        
        // Weapon & Firing state (hỗ trợ 0.2s critical window)
        weapon: { 
            isFiring: false, 
            id: "", 
            category: "", 
            triggerFired: false 
        },
        
        // Tracker & Camera
        tracker: {},
        camera: {
            lastTime: Date.now(),
            fireStartTime: null,
            integralYaw: 0.0,
            integralPitch: 0.0,
            prevErrorYaw: 0.0,
            prevErrorPitch: 0.0,
            emaYaw: null,
            emaPitch: null
        }
    };
}

// ============================================================================
// MODULE 1: WEAPON CLASSIFIER V4.0 (SIMPLIFIED + MAX DETAIL)
// Nhiệm vụ: Phân loại siêu nhanh, chính xác chỉ còn 3 core duy nhất.
// Bỏ hoàn toàn sniper-specific, RequireZeroVelocity riêng, ONETAP riêng.
// Chỉ tập trung vào 3 nhóm: SHOTGUN | AUTO | PRECISION (pistol + one-shot capable).
// ============================================================================
class WeaponClassifier {
    
    static classify(weaponData) {
        let profile = { 
            Core: "IGNORE", 
            RequireZeroVelocity: false 
        };
        
        if (!weaponData) return profile;

        // Ép IN HOA để chống lỗi server
        const id = (weaponData.id || "").toString().toUpperCase();
        const name = (weaponData.name || "").toString().toUpperCase();
        const category = (weaponData.category || "").toString().toUpperCase();

        const identifier = `${id}_${name}_${category}`;

        // 1. SHOTGUN CORE (Cận chiến - Laser Pellet)
        if (identifier.includes("SHOTGUN") || 
            identifier.includes("M1887") || identifier.includes("M1014") || 
            identifier.includes("SPAS") || identifier.includes("MAG-7") || 
            identifier.includes("TROGON") || identifier.includes("CHARGE") || 
            identifier.includes("M590")) {
            profile.Core = "SHOTGUN";
            return profile;
        } 
        
        // 2. AUTO CORE (AR/SMG/LMG - Laser Stream)
        if (identifier.includes("SMG") || identifier.includes("AR") || 
            identifier.includes("MACHINE") || identifier.includes("LMG") || 
            identifier.includes("MP40") || identifier.includes("UMP") || 
            identifier.includes("AK") || identifier.includes("SCAR") || 
            identifier.includes("GROZA") || identifier.includes("FAMAS") || 
            identifier.includes("AUG") || identifier.includes("M4A1")) {
            profile.Core = "AUTO";
            return profile;
        } 
        
        // 3. PRECISION CORE (Pistol + One-shot capable - bao gồm sniper nhưng KHÔNG xử lý riêng)
        // Tất cả súng bắn 1-2 phát headshot mạnh đều vào đây
        if (identifier.includes("SNIPER") || identifier.includes("PISTOL") || 
            identifier.includes("DESERT_EAGLE") || identifier.includes("WOODPECKER") || 
            identifier.includes("SVD") || identifier.includes("AC80") || 
            identifier.includes("AWM") || identifier.includes("M82B") || 
            identifier.includes("KAR98") || identifier.includes("DEAGLE") || 
            identifier.includes("REVOLVER") || identifier.includes("GLOCK")) {
            profile.Core = "PRECISION";
            // Không còn RequireZeroVelocity riêng nữa → thống nhất pipeline
            return profile;
        }

        // Mọi thứ khác (lựu đạn, dao, keo...) → IGNORE
        return profile;
    }

    static processWeaponState(payload) {
        const weaponState = _global.__OmniState.weapon;

        // Đồng bộ trạng thái bóp cò (hỗ trợ nhiều vị trí gói tin)
        if (payload.is_firing !== undefined) {
            weaponState.isFiring = payload.is_firing;
        }
        if (payload.weapon && payload.weapon.is_firing !== undefined) {
            weaponState.isFiring = payload.weapon.is_firing;
        }

        // Khi đổi súng → cập nhật profile ngay lập tức
        if (payload.weapon && payload.weapon.id !== undefined && payload.weapon.id !== weaponState.id) {
            weaponState.id = payload.weapon.id;
            weaponState.category = payload.weapon.category || "";

            _global.__OmniState.weaponProfile = this.classify(payload.weapon);
            
            // Debug log (có thể comment sau)
            console.log(`[OMNI-MATRIX] Weapon changed → ${weaponState.id} | Core: ${_global.__OmniState.weaponProfile.Core}`);
        }

        return payload;
    }
}

// ============================================================================
// MODULE 4: TARGET KINEMATICS V4.0 (NATIVE 0.2s LOCK HIJACKER + JERK PREDICTION)
// Tích hợp: 
// - Jerk Compensation + Vertical Anti-Overhead (giải quyết nhảy & overhead)
// - Dynamic Lead-Time tuned cho 0.2s wind-up
// - Firing-Aware Magnetic Inversion siêu mạnh (ép native lock vào đầu)
// - Dual-stage EMA + Strafe Dampener V2
// - Unified Critical Window export cho toàn pipeline
// ============================================================================
class TargetKinematics {
    
    static normalizeAngle(angle) {
        while (angle > 180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }

    static processTargetState(payload) {
        // 1. LẤY ANCHORPOS & TẮT AIM-ASSIST RÁC
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

        const weaponState = _global.__OmniState.weapon || {};
        const isFiring = weaponState.isFiring || weaponState.triggerFired || payload.is_firing || false;
        const currentTime = Date.now();

        let bestTarget = null;
        let lowestThreatScore = 999999.0;
        const currentYaw = payload.aim_yaw !== undefined ? payload.aim_yaw : (_global.__OmniState.camera.prevYaw || 0.0);
        if (payload.aim_yaw !== undefined) _global.__OmniState.camera.prevYaw = payload.aim_yaw;

        // ====================================================================
        // 2. DYNAMIC MAGNETIC INVERSION V4.0 (ÉP NATIVE LOCK VÀO ĐẦU)
        // ====================================================================
        for (let i = 0; i < payload.players.length; i++) {
            const enemy = payload.players[i];
            
            if (enemy.hitboxes) {
                // HEAD BOOST SIÊU MẠNH (đặc biệt khi bắn)
                if (enemy.hitboxes.head) {
                    const headBoost = isFiring ? 99999.0 : 9999.0;
                    if (enemy.hitboxes.head.snap_weight !== undefined) enemy.hitboxes.head.snap_weight = headBoost;
                    if (enemy.hitboxes.head.friction !== undefined) enemy.hitboxes.head.friction = 1.0;
                    enemy.hitboxes.head.priority = "HIGHEST";
                }

                // BODY SUPPRESSION MẠNH HƠN KHI BẮN
                const junkParts = ['chest', 'spine', 'pelvis', 'legs', 'arms', 'left_arm', 'right_arm', 'left_leg', 'right_leg'];
                for (let p = 0; p < junkParts.length; p++) {
                    const part = junkParts[p];
                    if (enemy.hitboxes[part]) {
                        const bodySuppress = isFiring ? -99999.0 : -9999.0;
                        if (enemy.hitboxes[part].snap_weight !== undefined) enemy.hitboxes[part].snap_weight = bodySuppress;
                        if (enemy.hitboxes[part].friction !== undefined) enemy.hitboxes[part].friction = 0.0;
                        enemy.hitboxes[part].priority = "IGNORE";
                    }
                }
            }

            // Threat scoring (ưu tiên head-lockable)
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
            if (Math.abs(this.normalizeAngle(enemyYaw - angleToMe)) < 30.0) threatScore -= 200.0;

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

        // ====================================================================
        // 3. ZERO-PING PREDICTION ENGINE V4.0 (JERK + VERTICAL ANTI-OVERHEAD)
        // ====================================================================
        if (bestTarget) {
            const targetState = _global.__OmniState.target;
            const tracker = _global.__OmniState.tracker;
            targetState.id = bestTarget.id;
            targetState.distance = bestTarget.distance;
            targetState.isFiringMode = isFiring;

            // Head center chính xác
            let headCenter = bestTarget.hitboxes?.head?.pos || 
                            { x: bestTarget.pos.x, y: bestTarget.pos.y + 1.5, z: bestTarget.pos.z };
            let targetAimPos = headCenter;
            targetState.pos = { ...targetAimPos };

            if (!tracker[bestTarget.id]) {
                tracker[bestTarget.id] = { 
                    history: [], 
                    velocity: {x:0, y:0, z:0},
                    lastVelocity: {x:0, y:0, z:0},
                    lastJerk: {x:0, y:0, z:0}
                };
                targetState.predicted_pos = { ...targetAimPos };
                targetState.velocity = {x:0, y:0, z:0};
            } else {
                let trackData = tracker[bestTarget.id];
                
                trackData.history.unshift({ pos: { ...targetAimPos }, time: currentTime });
                if (trackData.history.length > 15) trackData.history.pop();

                let prevFrame = trackData.history[1] || trackData.history[0];
                let dt = (currentTime - prevFrame.time) / 1000.0;

                if (dt > 0.0 && dt < 0.25) {
                    // VELOCITY (Dual-stage EMA)
                    let raw_vx = (targetAimPos.x - prevFrame.pos.x) / dt;
                    let raw_vy = (targetAimPos.y - prevFrame.pos.y) / dt;
                    let raw_vz = (targetAimPos.z - prevFrame.pos.z) / dt;

                    let alphaV = isFiring ? 0.68 : 0.52;
                    let vx = (raw_vx * alphaV) + (trackData.velocity.x * (1 - alphaV));
                    let vy = (raw_vy * alphaV) + (trackData.velocity.y * (1 - alphaV));
                    let vz = (raw_vz * alphaV) + (trackData.velocity.z * (1 - alphaV));

                    trackData.velocity = { x: vx, y: vy, z: vz };
                    targetState.velocity = { x: vx, y: vy, z: vz };

                    // ACCELERATION + JERK (mới)
                    let ax = 0, ay = 0, az = 0;
                    if (trackData.lastVelocity) {
                        ax = (vx - trackData.lastVelocity.x) / dt;
                        ay = (vy - trackData.lastVelocity.y) / dt;
                        az = (vz - trackData.lastVelocity.z) / dt;
                    }
                    trackData.lastVelocity = { x: vx, y: vy, z: vz };

                    // JERK (thay đổi gia tốc)
                    let jx = 0, jy = 0, jz = 0;
                    if (trackData.lastJerk) {
                        jx = (ax - trackData.lastJerk.x) / dt;
                        jy = (ay - trackData.lastJerk.y) / dt;
                        jz = (az - trackData.lastJerk.z) / dt;
                    }
                    trackData.lastJerk = { x: ax, y: ay, z: az };

                    // LEAD TIME TỐI ƯU CHO 0.2s
                    let timeToTarget = isFiring ? 0.092 : 0.098;

                    let accelMagXZ = Math.sqrt(ax*ax + az*az);
                    let strafeDampener = (accelMagXZ > 45) ? 0.16 : (accelMagXZ > 18 ? 0.52 : 1.0);

                    // PREDICTION + JERK COMPENSATION
                    let predX = targetAimPos.x + (vx * timeToTarget) + (0.5 * ax * timeToTarget * timeToTarget * strafeDampener) + (0.166 * jx * timeToTarget * timeToTarget * timeToTarget);
                    let predZ = targetAimPos.z + (vz * timeToTarget) + (0.5 * az * timeToTarget * timeToTarget * strafeDampener) + (0.166 * jz * timeToTarget * timeToTarget * timeToTarget);
                    let predY = targetAimPos.y + (vy * timeToTarget) + (0.5 * ay * timeToTarget * timeToTarget);

                    // VERTICAL ANTI-OVERHEAD (jump prediction)
                    let speed = Math.sqrt(vx*vx + vy*vy + vz*vz);
                    let isJumping = Math.abs(vy) > 1.3 && speed <= 13.0;
                    if (isJumping) {
                        predY -= 0.5 * 9.81 * (timeToTarget * timeToTarget) * 1.15; // Boost gravity
                    }

                    targetState.predicted_pos = { x: predX, y: predY, z: predZ };
                    
                } else {
                    targetState.predicted_pos = { ...targetAimPos };
                    targetState.velocity = {x:0, y:0, z:0};
                }
            }
        } else {
            _global.__OmniState.target = { 
                id: null, pos: null, predicted_pos: null, distance: 9999.0, 
                velocity: {x:0, y:0, z:0}, isFiringMode: false 
            };
        }

        return payload;
    }
}

// ============================================================================
// MODULE 7: CAMERA MANIPULATOR V9.0 (0.2s NATIVE LOCK HIJACKER + FULL HEAD SUSTAIN)
// Tích hợp: 
// - 0.2s Critical Window Hijack (ép native lock dính đầu)
// - Jerk Compensation + Anti-Overshoot (triệt tiêu trượt & overhead)
// - Dual-Layer (Camera + Barrel) + Feedforward từ M4 V4.0
// - Dynamic Strength + Deadzone theo firing/distance
// - High-Alpha EMA + Y-Axis Unchained
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
        const weaponState = _global.__OmniState.weapon || {};

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

        // Critical 0.2s native lock window
        const justStartedFiring = isFiring && !camState.wasFiring;
        if (justStartedFiring) camState.fireStartTime = currentTime;
        const fireElapsed = isFiring ? (currentTime - (camState.fireStartTime || currentTime)) : 0;
        camState.wasFiring = isFiring;

        if (!isFiring && !isScoping) {
            camState.integralYaw = camState.integralPitch = 0;
            return payload;
        }

        // Sử dụng predicted_pos từ M4 V4.0
        const dest = (isFiring && targetState.predicted_pos) ? targetState.predicted_pos : targetState.pos;

        const origin = selfState.lastAnchor ? 
            { x: selfState.lastAnchor.x, y: selfState.lastAnchor.y + 1.65, z: selfState.lastAnchor.z } : 
            { x: selfState.anchorPos.x, y: selfState.anchorPos.y + 1.65, z: selfState.anchorPos.z };

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
        // DYNAMIC PARAMETERS V9.0 (FIRING-AWARE + CRITICAL WINDOW)
        // ====================================================================
        const isCriticalWindow = isFiring && fireElapsed <= 220;
        const profile = _global.__OmniState.weaponProfile || {};
        const distance = targetState.distance || 50;

        let strengthYaw = isCriticalWindow ? 1.48 : (isFiring ? 1.22 : 0.95);
        let strengthPitch = isCriticalWindow ? 1.42 : (isFiring ? 1.18 : 0.92);

        if (isScoping) {
            strengthYaw *= 1.12;
            strengthPitch *= 1.15;
        }

        // ====================================================================
        // FEEDFORWARD + JERK COMPENSATION (từ M4 V4.0)
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
        // 4-PHASE CONTROL V9.0 (ANTI-SLIP + ANTI-OVERHEAD)
        // ====================================================================
        const dynamicDeadzone = isCriticalWindow ? 0.32 : (isFiring ? 0.68 : 2.0);

        if (Math.abs(errorYaw) <= dynamicDeadzone && Math.abs(errorPitch) <= dynamicDeadzone + 1.6) {
            // PHASE 1: PERFECT SUSTAIN (native lock dính chặt)
            outputYaw = ffYaw + errorYaw * 0.68;
            outputPitch = ffPitch + errorPitch * 0.75;
        } 
        else if (isCriticalWindow) {
            // PHASE 2: 0.2s HIJACK (ép native lock ngay lập tức)
            outputYaw = errorYaw * strengthYaw;
            outputPitch = errorPitch * strengthPitch;
        } 
        else if (isFiring) {
            // PHASE 3: SUSTAINED TRACKING (sau critical window)
            outputPitch = errorPitch * strengthPitch; // Y unchained
            const Kp = (profile.Core === "PRECISION") ? 58 : 46;
            outputYaw = (errorYaw * Kp * dt) + ffYaw * 0.88;
        } 
        else {
            // PHASE 4: PRE-FIRE / SCOPING (humanized nhưng vẫn mạnh)
            const Kp = 26;
            const Ki = 0.012;
            const Kd = 0.48 + 16 / (Math.abs(errorYaw) + 3);

            camState.integralYaw = (camState.integralYaw || 0) + errorYaw * dt;
            camState.integralPitch = (camState.integralPitch || 0) + errorPitch * dt;

            const derivYaw = (errorYaw - (camState.prevErrorYaw || 0)) / dt;

            outputYaw = (errorYaw * Kp + camState.integralYaw * Ki + derivYaw * Kd) * dt + ffYaw * 0.72;
            outputPitch = errorPitch * 28 * dt + ffPitch * 0.72;
        }

        // ANTI-OVERSHOOT CLAMP
        if (Math.abs(outputYaw) > Math.abs(errorYaw) * 1.1 && errorYaw * outputYaw > 0) {
            outputYaw = errorYaw * 0.95;
        }
        if (Math.abs(outputPitch) > Math.abs(errorPitch) * 1.1 && errorPitch * outputPitch > 0) {
            outputPitch = errorPitch * 0.95;
        }

        camState.prevErrorYaw = errorYaw;
        camState.prevErrorPitch = errorPitch;

        // ====================================================================
        // FINAL EMA + HIGH ALPHA IN CRITICAL WINDOW
        // ====================================================================
        if (camState.emaYaw === undefined) camState.emaYaw = currentYaw;
        if (camState.emaPitch === undefined) camState.emaPitch = currentPitch;

        const alpha = isCriticalWindow ? 0.995 : (isFiring ? 0.97 : 0.82);

        let newYaw = currentYaw + outputYaw;
        let newPitch = currentPitch + outputPitch;

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
// MODULE 6.5: TRIGGERCHECK V3.0 (NATIVE 0.2s WIND-UP SYNC + HEAD-LOCK VIABILITY)
// Tích hợp: 
// - 0.2s Critical Window Hijack (ép native lock kích hoạt ngay)
// - Dynamic Hitchance + Head Viability Engine
// - Predictive Pre-Fire (peek, standing, CQC)
// - Weapon-Adaptive (SHOTGUN / AUTO / PRECISION)
// - Zero-Waste + Charge Weapon Support
// ============================================================================
class TriggerCheck {
    static evaluate(payload) {
        const targetState = _global.__OmniState.target;
        const weaponState = _global.__OmniState.weapon;
        const profile = _global.__OmniState.weaponProfile || {};
        const camState = _global.__OmniState.camera || {};

        // 1. RESET TRẠNG THÁI TICK TRƯỚC
        weaponState.triggerFired = false;

        // Bỏ qua nếu không có core
        if (profile.Core === "IGNORE") return payload;

        // Trạng thái bóp cò thủ công từ người chơi
        let isManualFiring = payload.is_firing || (payload.weapon && payload.weapon.is_firing) || false;

        // ====================================================================
        // 2. PERFECT SYNC INTERCEPTOR (0.2s NATIVE LOCK GATE)
        // ====================================================================
        if (!targetState.id || !targetState.predicted_pos) {
            // Không có mục tiêu hợp lệ → chặn bắn để tránh phí đạn
            if (isManualFiring) {
                payload.is_firing = false;
                if (payload.weapon) payload.weapon.is_firing = false;
                weaponState.isFiring = false;
            }
            return payload;
        }

        // Lấy dữ liệu từ M4 & M7
        const tracker = _global.__OmniState.tracker[targetState.id] || {};
        const isCriticalWindow = camState.fireStartTime 
            ? (Date.now() - camState.fireStartTime) <= 220 
            : false;
        const distance = targetState.distance || 9999;
        const speed = tracker.velocity 
            ? Math.sqrt(tracker.velocity.x**2 + tracker.velocity.z**2) 
            : 0;

        // ====================================================================
        // 3. HEAD-LOCK VIABILITY & HITCHANCE ENGINE V3.0
        // ====================================================================
        let hitchance = 100.0;
        const isBehindCover = tracker.is_behind_cover || false;

        // Giảm hitchance khi địch nấp sau vật cản (trừ PRECISION)
        if (isBehindCover && profile.Core !== "PRECISION") {
            hitchance = 20.0;
        }

        // Giảm mạnh khi địch di chuyển nhanh + khoảng cách xa
        if (speed > 7.5 && distance > 35) {
            hitchance *= 0.55;
        }

        // Tăng mạnh trong critical 0.2s window (native lock đã sẵn sàng)
        if (isCriticalWindow) {
            hitchance = 100.0;
        }

        // Nếu hitchance quá thấp → chặn bắn
        if (hitchance < 30.0) {
            if (isManualFiring) {
                payload.is_firing = false;
                if (payload.weapon) payload.weapon.is_firing = false;
                weaponState.isFiring = false;
            }
            return payload;
        }

        // ====================================================================
        // 4. PREDICTIVE PRE-FIRE + AUTO-FIRE (ĐÓN LÕNG THÔNG MINH)
        // ====================================================================
        let shouldAutoFire = false;

        // TRƯỜNG HỢP 1: Địch peek ra khỏi vật cản (Tatsuya / strafe)
        if (speed > 4.8 && tracker.is_partially_hidden) {
            shouldAutoFire = true;
        }

        // TRƯỜNG HỢP 2: PRECISION + địch đứng im hoặc di chuyển chậm
        if (profile.Core === "PRECISION" && speed < 1.8 && !isBehindCover) {
            shouldAutoFire = true;
        }

        // TRƯỜNG HỢP 3: SHOTGUN CQC + head đã align
        if (profile.Core === "SHOTGUN" && distance < 14 && Math.abs(targetState.predicted_pos.y - targetState.pos.y) < 2.2) {
            shouldAutoFire = true;
        }

        // TRƯỜNG HỢP 4: AUTO đang sustain fire + critical window
        if (profile.Core === "AUTO" && isCriticalWindow) {
            shouldAutoFire = true;
        }

        // ====================================================================
        // 5. THỰC THI ÁN TỬ (NATIVE 0.2s EXECUTION COMMAND)
        // ====================================================================
        const shouldFire = isManualFiring || shouldAutoFire;

        if (shouldFire) {
            // Tiêm lệnh bắn ngay → kích hoạt native 0.2s wind-up
            payload.is_firing = true;
            if (payload.weapon) {
                payload.weapon.is_firing = true;
                // Bỏ delay súng charge (Charge Buster, etc.)
                if (payload.weapon.charge_time !== undefined) {
                    payload.weapon.charge_time = 9999.0;
                }
            }

            // Broadcast cho toàn pipeline
            weaponState.isFiring = true;
            weaponState.triggerFired = true;

            // Cập nhật fireStartTime cho M7 & M5
            if (camState) camState.fireStartTime = Date.now();
        }

        return payload;
    }
}

// ============================================================================
// MODULE 5: SELF KINEMATICS V10.0 (FULL 0.2s INERTIA FREEZE + CHRONOS ANCHOR V2)
// Tích hợp: 
// - 0.2s Critical Window Inertia Freeze (đóng băng toàn bộ cửa sổ)
// - Chronos Anchor V2 + CQC Head Origin Injection
// - Anti-Reconciliation History Buffer
// - Weapon-Adaptive + Unified Critical State
// ============================================================================
class SelfKinematics {
    static processSelfState(payload) {
        const state = _global.__OmniState.self;
        const targetState = _global.__OmniState.target;
        const weaponState = _global.__OmniState.weapon;
        const camState = _global.__OmniState.camera || {};
        const profile = _global.__OmniState.weaponProfile || {};

        // Unified critical 0.2s window
        const isFiring = weaponState.isFiring || weaponState.triggerFired || payload.is_firing || false;
        const isCriticalWindow = isFiring && camState.fireStartTime 
            ? (Date.now() - camState.fireStartTime) <= 220 
            : false;

        // Khởi tạo history buffer (anti-reconciliation)
        if (!state.history) state.history = [];
        if (!state.lastAnchor) state.lastAnchor = null;

        // ====================================================================
        // TRẠNG THÁI NGHỈ: CẬP NHẬT LIÊN TỤC (KHÔNG CAN THIỆP)
        // ====================================================================
        if (payload.pos !== undefined) {
            state.history.unshift({ ...payload.pos, time: Date.now() });
            if (state.history.length > 8) state.history.pop();
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

        // 1. CHRONOS ANCHOR V2 (Neo anchorPos tĩnh tuyệt đối)
        if (payload.anchorPos !== undefined && state.lastAnchor) {
            payload.anchorPos.x = state.lastAnchor.x;
            payload.anchorPos.y = state.lastAnchor.y;
            payload.anchorPos.z = state.lastAnchor.z;
        }

        // 2. CQC HEAD ORIGIN INJECTION (NÒNG SÚNG HƯỚNG ĐẦU)
        if (payload.fire_origin !== undefined && targetState.predicted_pos) {
            if (targetState.distance < 4.0) {
                // Cận chiến: Dịch nòng thẳng vào sọ
                payload.fire_origin = {
                    x: targetState.predicted_pos.x,
                    y: targetState.predicted_pos.y,
                    z: targetState.predicted_pos.z - 0.12
                };
            } else if (state.lastAnchor) {
                // Giữ origin neo tĩnh
                payload.fire_origin = {
                    x: state.lastAnchor.x,
                    y: state.lastAnchor.y + 1.65,
                    z: state.lastAnchor.z
                };
            }
        }

        // 3. ANCHOR ROOTING + BODY SWAY
        if (payload.body_sway !== undefined) payload.body_sway = 0.0;

        // 4. FULL 0.2s INERTIA FREEZE V10.0
        if (isCriticalWindow || weaponState.triggerFired) {
            // Đóng băng vận tốc + acceleration
            if (payload.velocity !== undefined) {
                payload.velocity = { x: 0.0, y: 0.0, z: 0.0 };
            }
            if (payload.acceleration !== undefined) {
                payload.acceleration = { x: 0.0, y: 0.0, z: 0.0 };
            }

            // Giả mạo trạng thái tĩnh lặng hoàn toàn
            if (payload.speed !== undefined) payload.speed = 0.0;
            if (payload.is_moving !== undefined) payload.is_moving = false;

            // Bonus stance cho PRECISION và SHOTGUN
            if (profile.Core === "PRECISION" || profile.Core === "SHOTGUN") {
                if (payload.stance !== undefined) payload.stance = 0; // Standing still
            }
        }

        // Cập nhật lastAnchor cho frame tiếp theo
        if (payload.anchorPos !== undefined) {
            state.lastAnchor = { ...payload.anchorPos };
        }

        return payload;
    }
}

// ============================================================================
// MODULE 2: SHOTGUN CORE V4.0 (LASER PELLET PERFECT + 0.2s NATIVE LOCK HIJACKER)
// Tích hợp: 
// - Perfect Laser Pellet Concentration (1 tia duy nhất vào predicted head)
// - Per-Pellet Head Force + Critical Window Boost
// - M590 Anti-Slip Max + Full Damage Override
// - Unified Critical Window (đồng bộ M7/M5/M4)
// ============================================================================
class ShotgunCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;
        const weaponState = _global.__OmniState.weapon;
        const camState = _global.__OmniState.camera || {};
        const profile = _global.__OmniState.weaponProfile || {};

        // Unified critical 0.2s window
        const isCriticalWindow = weaponState.isFiring && camState.fireStartTime 
            ? (Date.now() - camState.fireStartTime) <= 220 
            : false;

        // --------------------------------------------------------------------
        // 1. TRIỆT TIÊU HOÀN TOÀN VẬT LÝ SÚNG (RECOIL + SPREAD = 0)
        // --------------------------------------------------------------------
        if (payload.weapon) {
            if (payload.weapon.recoil_y !== undefined) payload.weapon.recoil_y = 0.0;
            if (payload.weapon.recoil_x !== undefined) payload.weapon.recoil_x = 0.0;
            if (payload.weapon.recoil_accumulation !== undefined) payload.weapon.recoil_accumulation = 0.0;

            if (payload.weapon.base_spread !== undefined) payload.weapon.base_spread = 0.0;
            if (payload.weapon.dynamic_spread !== undefined) payload.weapon.dynamic_spread = 0.0;
            if (payload.weapon.max_spread !== undefined) payload.weapon.max_spread = 0.0;
            if (payload.weapon.spread_add_per_shot !== undefined) payload.weapon.spread_add_per_shot = 0.0;
        }

        // --------------------------------------------------------------------
        // 2. PERFECT LASER PELLET CONCENTRATION V2 (1 TIA DUY NHẤT)
        // --------------------------------------------------------------------
        if (payload.bullet_events && Array.isArray(payload.bullet_events) && 
            targetState.predicted_pos && selfState.anchorPos) {
            
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
                
                // Ép mọi pellet bay theo đúng 1 tia laser thẳng predicted head
                if (pellet.ray_dir) {
                    pellet.ray_dir = { ...perfectDir };
                }
                
                pellet.target_id = targetState.id;

                // Bonus cực mạnh trong critical window (M590 anti-slip)
                if (isCriticalWindow) {
                    if (pellet.deviation !== undefined) pellet.deviation = 0.0;
                    if (pellet.spread_angle !== undefined) pellet.spread_angle = 0.0;
                    if (pellet.is_penetrating !== undefined) pellet.is_penetrating = true;
                    if (pellet.collision_obstacle !== undefined) pellet.collision_obstacle = false;
                }
            }
        }

        // --------------------------------------------------------------------
        // 3. DAMAGE FINALIZATION + HEADSHOT FORCE (CHO MỌI PELLET)
        // --------------------------------------------------------------------
        if (payload.damage_report) {
            payload.damage_report.hit_bone = 8;
            payload.damage_report.is_headshot = true;
            
            // Xóa giảm sát thương theo khoảng cách
            if (payload.damage_report.distance_penalty !== undefined) {
                payload.damage_report.distance_penalty = 0.0;
            }
            
            // Xuyên giáp 100%
            if (payload.damage_report.armor_penetration !== undefined) {
                payload.damage_report.armor_penetration = 1.0;
            }
            if (payload.damage_report.ignore_armor !== undefined) {
                payload.damage_report.ignore_armor = true;
            }
            if (payload.damage_report.penetration_ratio !== undefined) {
                payload.damage_report.penetration_ratio = 1.0;
            }

            // Bonus sát thương đặc biệt trong critical window (M590 mạnh hơn)
            if (isCriticalWindow && payload.damage_report.damage_multiplier !== undefined) {
                payload.damage_report.damage_multiplier = (profile.Core === "SHOTGUN") ? 1.22 : 1.15;
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 3: AUTO CORE V4.0 (LASER BULLET STREAM PERFECT + 0.2s NATIVE LOCK HIJACKER)
// Tích hợp: 
// - Perfect Laser Bullet Stream (tất cả đạn bay theo 1 tia duy nhất)
// - 0.2s Critical Window Boost + Full Physics Nullification
// - Damage Headshot Force tối thượng
// - Unified Critical Window (đồng bộ M7/M5/M4)
// ============================================================================
class AutoCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;
        const weaponState = _global.__OmniState.weapon;
        const camState = _global.__OmniState.camera || {};
        const profile = _global.__OmniState.weaponProfile || {};

        // Unified critical 0.2s window
        const isCriticalWindow = weaponState.isFiring && camState.fireStartTime 
            ? (Date.now() - camState.fireStartTime) <= 220 
            : false;

        // --------------------------------------------------------------------
        // 1. TRIỆT TIÊU HOÀN TOÀN VẬT LÝ SÚNG (RECOIL + SPREAD + INACCURACY = 0)
        // --------------------------------------------------------------------
        if (payload.weapon) {
            // Recoil
            if (payload.weapon.recoil_y !== undefined) payload.weapon.recoil_y = 0.0;
            if (payload.weapon.recoil_x !== undefined) payload.weapon.recoil_x = 0.0;
            if (payload.weapon.recoil_accumulation !== undefined) payload.weapon.recoil_accumulation = 0.0;

            // Spread
            if (payload.weapon.base_spread !== undefined) payload.weapon.base_spread = 0.0;
            if (payload.weapon.dynamic_spread !== undefined) payload.weapon.dynamic_spread = 0.0;
            if (payload.weapon.max_spread !== undefined) payload.weapon.max_spread = 0.0;
            if (payload.weapon.spread_add_per_shot !== undefined) payload.weapon.spread_add_per_shot = 0.0;

            // Inaccuracy
            if (payload.weapon.inaccuracy_move !== undefined) payload.weapon.inaccuracy_move = 0.0;
            if (payload.weapon.inaccuracy_jump !== undefined) payload.weapon.inaccuracy_jump = 0.0;
            if (payload.weapon.inaccuracy_crouch !== undefined) payload.weapon.inaccuracy_crouch = 0.0;
        }

        // --------------------------------------------------------------------
        // 2. PERFECT LASER BULLET STREAM V2 (KHÓA CHẶT LUỒNG ĐẠN)
        // --------------------------------------------------------------------
        if (payload.bullet_events && Array.isArray(payload.bullet_events) && 
            targetState.predicted_pos && selfState.anchorPos) {
            
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
                
                // Ép mọi viên đạn bay theo đúng 1 tia laser thẳng predicted head
                if (bullet.ray_dir) {
                    bullet.ray_dir = { ...perfectDir };
                }
                
                bullet.target_id = targetState.id;

                // Bonus cực mạnh trong critical window
                if (isCriticalWindow) {
                    if (bullet.deviation !== undefined) bullet.deviation = 0.0;
                    if (bullet.spread_angle !== undefined) bullet.spread_angle = 0.0;
                    if (bullet.is_penetrating !== undefined) bullet.is_penetrating = true;
                    if (bullet.collision_obstacle !== undefined) bullet.collision_obstacle = false;
                }
            }
        }

        // --------------------------------------------------------------------
        // 3. DAMAGE FINALIZATION + HEADSHOT FORCE (CHO MỌI VIÊN ĐẠN)
        // --------------------------------------------------------------------
        if (payload.damage_report) {
            payload.damage_report.hit_bone = 8;
            payload.damage_report.is_headshot = true;
            
            // Xóa giảm sát thương theo khoảng cách
            if (payload.damage_report.distance_penalty !== undefined) {
                payload.damage_report.distance_penalty = 0.0;
            }
            
            // Xuyên giáp 100%
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
                payload.damage_report.damage_multiplier = 1.18;
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 6: ONE TAP CORE / PRECISION CORE V4.0 (ONE-SHOT HEADLOCK PERFECT + 0.2s NATIVE LOCK HIJACKER)
// Tích hợp: 
// - Perfect Raycast Override vào predicted head
// - 0.2s Critical Window Hijack + Instant Headshot Force
// - Recoil Recovery siêu nhanh + Full Physics Nullification
// - CQC Head Origin Sync + Unified Critical Window
// ============================================================================
class OneTapCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;
        const weaponState = _global.__OmniState.weapon;
        const camState = _global.__OmniState.camera || {};
        const profile = _global.__OmniState.weaponProfile || {};

        // Unified critical 0.2s window
        const isCriticalWindow = weaponState.isFiring && camState.fireStartTime 
            ? (Date.now() - camState.fireStartTime) <= 220 
            : false;

        // --------------------------------------------------------------------
        // 1. TRIỆT TIÊU HOÀN TOÀN VẬT LÝ SÚNG NGẮM / LỤC (SPREAD + RECOIL = 0)
        // --------------------------------------------------------------------
        if (payload.weapon) {
            // Spread
            if (payload.weapon.base_spread !== undefined) payload.weapon.base_spread = 0.0;
            if (payload.weapon.dynamic_spread !== undefined) payload.weapon.dynamic_spread = 0.0;

            // Recoil
            if (payload.weapon.recoil_y !== undefined) payload.weapon.recoil_y = 0.0;
            if (payload.weapon.recoil_x !== undefined) payload.weapon.recoil_x = 0.0;

            // Recoil Recovery siêu nhanh (không giật nảy màn hình)
            if (payload.weapon.recoil_recovery !== undefined) {
                payload.weapon.recoil_recovery = 9999.0;
            }

            // Inaccuracy
            if (payload.weapon.inaccuracy_move !== undefined) payload.weapon.inaccuracy_move = 0.0;
            if (payload.weapon.inaccuracy_jump !== undefined) payload.weapon.inaccuracy_jump = 0.0;
            if (payload.weapon.inaccuracy_crouch !== undefined) payload.weapon.inaccuracy_crouch = 0.0;
        }

        // --------------------------------------------------------------------
        // 2. PERFECT ONE-SHOT RAYCAST OVERRIDE (ÉP ĐẠN THẲNG PREDICTED HEAD)
        // --------------------------------------------------------------------
        if (payload.bullet_events && Array.isArray(payload.bullet_events) && 
            targetState.predicted_pos && selfState.anchorPos) {
            
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
                
                // Ép ray_dir thẳng predicted head (dù camera chưa xoay đến)
                if (bullet.ray_dir) {
                    bullet.ray_dir = { ...perfectDir };
                }
                
                bullet.target_id = targetState.id;

                // Bonus cực mạnh trong critical window
                if (isCriticalWindow) {
                    if (bullet.deviation !== undefined) bullet.deviation = 0.0;
                    if (bullet.spread_angle !== undefined) bullet.spread_angle = 0.0;
                    if (bullet.is_penetrating !== undefined) bullet.is_penetrating = true;
                    if (bullet.collision_obstacle !== undefined) bullet.collision_obstacle = false;
                }
            }
        }

        // --------------------------------------------------------------------
        // 3. DAMAGE FINALIZATION + INSTANT HEADSHOT FORCE
        // --------------------------------------------------------------------
        if (payload.damage_report) {
            payload.damage_report.hit_bone = 8;
            payload.damage_report.is_headshot = true;
            
            // Xóa giảm sát thương theo khoảng cách
            if (payload.damage_report.distance_penalty !== undefined) {
                payload.damage_report.distance_penalty = 0.0;
            }
            
            // Xuyên giáp 100%
            if (payload.damage_report.armor_penetration !== undefined) {
                payload.damage_report.armor_penetration = 1.0;
            }
            if (payload.damage_report.ignore_armor !== undefined) {
                payload.damage_report.ignore_armor = true;
            }
            if (payload.damage_report.penetration_ratio !== undefined) {
                payload.damage_report.penetration_ratio = 1.0;
            }

            // Bonus sát thương trong critical window (one-tap mạnh hơn)
            if (isCriticalWindow && payload.damage_report.damage_multiplier !== undefined) {
                payload.damage_report.damage_multiplier = 1.25;
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 8: MAGIC BULLET CORE V10.0 (BALLISTIC DECOUPLING PERFECT + 0.2s NATIVE LOCK HIJACKER)
// Tích hợp: 
// - Full Miss-to-Hit Inversion trong 0.2s window
// - Singularity Vector + Perfect Fire Origin
// - Advanced Ballistic Decoupling (triệt tiêu mọi quán tính)
// - Damage Finalization tối thượng (không xuyên tường)
// - Unified Critical Window
// ============================================================================
class MagicBulletCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;
        const weaponState = _global.__OmniState.weapon;
        const camState = _global.__OmniState.camera || {};

        // Unified critical 0.2s window
        const isCriticalWindow = weaponState.isFiring && camState.fireStartTime 
            ? (Date.now() - camState.fireStartTime) <= 220 
            : false;

        if (!targetState || !targetState.id || !targetState.predicted_pos) return payload;

        // ====================================================================
        // 1. NGHỊCH ĐẢO SINH TỬ (MISS-TO-HIT INVERSION)
        // ====================================================================
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
        // 2. SMART ANTI-OVERLAP V2 (CHỈ ẢNH HƯỞNG KẺ KHÁC)
        // ====================================================================
        if (payload.players && Array.isArray(payload.players)) {
            for (let i = 0; i < payload.players.length; i++) {
                let enemy = payload.players[i];
                if (enemy.id !== targetState.id && enemy.hitboxes) {
                    const bodyParts = ['head', 'chest', 'pelvis', 'legs', 'arms'];
                    for (let p = 0; p < bodyParts.length; p++) {
                        if (enemy.hitboxes[bodyParts[p]]) {
                            enemy.hitboxes[bodyParts[p]].radius = 0.01;
                        }
                    }
                }
            }
        }

        // ====================================================================
        // 3. SINGULARITY VECTOR + PERFECT ORIGIN
        // ====================================================================
        let perfectDir = null;
        let origin = payload.fire_origin || selfState.lastAnchor || selfState.anchorPos;
        
        if (origin && targetState.predicted_pos) {
            let dx = targetState.predicted_pos.x - origin.x;
            let dy = targetState.predicted_pos.y - (payload.fire_origin ? origin.y : origin.y + 1.65);
            let dz = targetState.predicted_pos.z - origin.z;
            const mag = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (mag > 0) perfectDir = { x: dx/mag, y: dy/mag, z: dz/mag };
        }

        // ====================================================================
        // 4. BALLISTIC DECOUPLING V3 (TRIỆT TIÊU TOÀN BỘ QUÁN TÍNH)
        // ====================================================================
        if (perfectDir && payload.bullet_events && Array.isArray(payload.bullet_events)) {
            for (let i = 0; i < payload.bullet_events.length; i++) {
                let bullet = payload.bullet_events[i];
                
                bullet.ray_dir = { ...perfectDir };
                bullet.target_id = targetState.id;

                // Triệt tiêu mọi sai số
                if (bullet.spread_angle !== undefined) bullet.spread_angle = 0.0;
                if (bullet.deviation !== undefined) bullet.deviation = 0.0;

                // Decoupling toàn diện
                if (bullet.angular_velocity !== undefined) bullet.angular_velocity = 0.0;
                if (bullet.momentum_offset !== undefined) bullet.momentum_offset = 0.0;
                if (bullet.drift !== undefined) bullet.drift = 0.0;
                if (bullet.trajectory_curve !== undefined) bullet.trajectory_curve = 0.0;
                if (bullet.velocity_inheritance !== undefined) bullet.velocity_inheritance = 0.0;
                if (bullet.gravity_influence !== undefined) bullet.gravity_influence = 0.0;
                if (bullet.wind_effect !== undefined) bullet.wind_effect = 0.0;

                // Bonus trong critical window
                if (isCriticalWindow) {
                    if (bullet.collision_obstacle !== undefined) bullet.collision_obstacle = false;
                }
            }
        }

        // ====================================================================
        // 5. DAMAGE FINALIZATION + HEADSHOT FORCE (TỐI HẬU - KHÔNG XUYÊN TƯỜNG)
        // ====================================================================
        if (payload.damage_report || payload.hit_event) {
            let report = payload.damage_report || payload.hit_event;
            
            report.target_id = targetState.id;
            report.hit_bone = 8;
            report.is_headshot = true;
            
            // Hit position = predicted head
            report.hit_pos = { ...targetState.predicted_pos };
            if (report.ray_dir && perfectDir) report.ray_dir = { ...perfectDir };

            // Xóa giảm sát thương + max penetration (không xuyên tường)
            if (report.distance_penalty !== undefined) report.distance_penalty = 0.0;
            if (report.armor_penetration !== undefined) report.armor_penetration = 1.0;
            if (report.ignore_armor !== undefined) report.ignore_armor = true;
            if (report.penetration_ratio !== undefined) report.penetration_ratio = 1.0;

            // Critical window bonus
            if (isCriticalWindow && report.damage_multiplier !== undefined) {
                report.damage_multiplier = 1.18;
            }
        }

        return payload;
    }
}

// ============================================================================
// BỘ ĐIỀU PHỐI TỔNG (MATRIX DISPATCHER V2.8 - CLEAN FRAMEWORK)
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
        
        // Module 1 luôn chạy đầu tiên
        payload = WeaponClassifier.processWeaponState(payload);

        // Các module sau sẽ được chèn vào đây ở các bước tiếp theo
        // Hiện tại chỉ chạy M1 để test framework

        // Recursive processing cho các key con
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
    if ($response.body.indexOf('"players"') !== -1 || 
        $response.body.indexOf('"weapon"') !== -1 || 
        $response.body.indexOf('"report"') !== -1 || 
        $response.body.indexOf('T_33_') !== -1) {
        
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
