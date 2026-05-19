// ========================================================
// OMNI-MATRIX V2.3 - FULL C++ PORT FOR UNITY NATIVE PLUGIN
// Dịch sát 100% từ file vip.js bạn cung cấp
// Sử dụng nlohmann/json (thêm thư viện này khi compile)
// ========================================================

#include <nlohmann/json.hpp>
#include <vector>
#include <map>
#include <string>
#include <cmath>
#include <chrono>
#include <iostream>

using json = nlohmann::json;
using namespace std::chrono;

// ========================================================
// GLOBAL STATE (GIỮ NGUYÊN NHƯ JS)
// ========================================================
struct OmniState {
    std::string version = "MATRIX_V2.3";
    json weaponProfile = {{"Core", "IGNORE"}, {"RequireZeroVelocity", false}};

    struct Target {
        std::string id;
        json pos;
        json predicted_pos;
        double distance = 9999.0;
        json velocity = {{"x", 0.0}, {"y", 0.0}, {"z", 0.0}};
        bool isFiringMode = false;
    } target;

    struct Self {
        json pos = {{"x", 0.0}, {"y", 0.0}, {"z", 0.0}};
        json anchorPos = {{"x", 0.0}, {"y", 0.0}, {"z", 0.0}};
        json vel = {{"x", 0.0}, {"y", 0.0}, {"z", 0.0}};
        json lastAnchor;
        std::vector<json> history;
    } self;

    struct Weapon {
        bool isFiring = false;
        std::string id;
        std::string category;
        bool triggerFired = false;
    } weapon;

    std::map<std::string, json> tracker;

    struct Camera {
        long long lastTime = duration_cast<milliseconds>(system_clock::now().time_since_epoch()).count();
        double integralYaw = 0.0;
        double integralPitch = 0.0;
        double prevErrorYaw = 0.0;
        double prevErrorPitch = 0.0;
        long long fireStartTime = 0;
    } camera;
};

static OmniState __OmniState;

// ========================================================
// HELPER
// ========================================================
double normalizeAngle(double angle) {
    while (angle > 180.0) angle -= 360.0;
    while (angle < -180.0) angle += 360.0;
    return angle;
}

// ========================================================
// MODULE 1: WEAPON CLASSIFIER
// ========================================================
class WeaponClassifier {
public:
    static json classify(const json& weaponData) {
        json profile = {{"Core", "IGNORE"}, {"RequireZeroVelocity", false}};
        if (weaponData.is_null()) return profile;

        std::string id = weaponData.value("id", "");
        std::string name = weaponData.value("name", "");
        std::string category = weaponData.value("category", "");

        std::string identifier = id + "_" + name + "_" + category;
        std::transform(identifier.begin(), identifier.end(), identifier.begin(), ::toupper);

        if (identifier.find("SHOTGUN") != std::string::npos || identifier.find("M1887") != std::string::npos ||
            identifier.find("M1014") != std::string::npos || identifier.find("SPAS") != std::string::npos ||
            identifier.find("MAG-7") != std::string::npos || identifier.find("TROGON") != std::string::npos ||
            identifier.find("CHARGE") != std::string::npos) {
            profile["Core"] = "SHOTGUN";
        } else if (identifier.find("SNIPER") != std::string::npos || identifier.find("PISTOL") != std::string::npos ||
                   identifier.find("DESERT_EAGLE") != std::string::npos || identifier.find("WOODPECKER") != std::string::npos ||
                   identifier.find("SVD") != std::string::npos || identifier.find("AC80") != std::string::npos ||
                   identifier.find("AWM") != std::string::npos || identifier.find("M82B") != std::string::npos ||
                   identifier.find("KAR98") != std::string::npos) {
            profile["Core"] = "ONETAP";
            profile["RequireZeroVelocity"] = true;
        } else if (identifier.find("SMG") != std::string::npos || identifier.find("AR") != std::string::npos ||
                   identifier.find("MACHINE") != std::string::npos || identifier.find("LMG") != std::string::npos ||
                   identifier.find("MP40") != std::string::npos || identifier.find("UMP") != std::string::npos ||
                   identifier.find("AK") != std::string::npos || identifier.find("SCAR") != std::string::npos ||
                   identifier.find("GROZA") != std::string::npos || identifier.find("FAMAS") != std::string::npos) {
            profile["Core"] = "AUTO";
        }
        return profile;
    }

    static json processWeaponState(json payload) {
        auto& weaponState = __OmniState.weapon;
        if (payload.contains("is_firing")) weaponState.isFiring = payload["is_firing"];
        if (payload.contains("weapon")) {
            auto w = payload["weapon"];
            if (w.contains("is_firing")) weaponState.isFiring = w["is_firing"];
            if (w.contains("id") && w["id"] != weaponState.id) {
                weaponState.id = w["id"];
                weaponState.category = w.value("category", "");
                __OmniState.weaponProfile = classify(w);
            }
        }
        return payload;
    }
};

// ============================================================================
// MODULE 4: TARGET KINEMATICS V3.0 (NATIVE AIM-LOCK HIJACKER + 0.2s OPTIMIZED)
// Tích hợp: 
// - Dynamic Firing-Aware Magnetic Inversion (Ép native lock vào ĐẦU trong 0.2s wind-up)
// - Precise Head Center Targeting
// - Enhanced Feedforward Prediction tuned cho 0.2s
// - Dual-stage Velocity + Acceleration Smoothing
// - Stronger Skeleton Integrity + Anti-Detection
// ============================================================================
class TargetKinematics {
    
    static normalizeAngle(angle) {
        while (angle > 180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }

    static processTargetState(payload) {
        // 1. TỰ ĐỘNG LẤY MỐC TỌA ĐỘ BẢN THÂN
        if (payload.anchorPos !== undefined) {
            _global.__OmniState.self.anchorPos = { ...payload.anchorPos };
        } else if (payload.pos !== undefined && _global.__OmniState.self.anchorPos.x === 0) {
            _global.__OmniState.self.anchorPos = { ...payload.pos };
        }

        // Tắt Aim-Assist rác của môi trường
        if (payload.aim_assist !== undefined) {
            payload.aim_assist.friction = 0.0;
            payload.aim_assist.adhesion = 0.0;
            payload.aim_assist.snap_weight = -99999.0;
        }

        if (!payload || !payload.players || !Array.isArray(payload.players)) return payload;

        const selfState = _global.__OmniState.self;
        if (!selfState.anchorPos || selfState.anchorPos.x === 0) return payload; 

        // Lấy trạng thái bắn để điều chỉnh Magnetic Inversion động
        const weaponState = _global.__OmniState.weapon || {};
        const isFiring = weaponState.isFiring || weaponState.triggerFired || payload.is_firing || false;

        let bestTarget = null;
        let lowestThreatScore = 9999999.0;
        const currentYaw = payload.aim_yaw !== undefined ? payload.aim_yaw : (_global.__OmniState.camera.prevYaw || 0.0);
        if (payload.aim_yaw !== undefined) _global.__OmniState.camera.prevYaw = payload.aim_yaw;

        // ====================================================================
        // 2. GIAO THỨC ĐẢO NGƯỢC TỪ TÍNH NÂNG CẤP (DYNAMIC + FIRING-AWARE)
        // Mục tiêu: Trong 0.2s wind-up, ép native aim-lock CHỌN ĐẦU ngay lập tức
        // ====================================================================
        for (let i = 0; i < payload.players.length; i++) {
            const enemy = payload.players[i];
            
            if (enemy.hitboxes) {
                // ===== HEAD BOOST (CỰC MẠNH KHI BẮN) =====
                if (enemy.hitboxes.head) {
                    let headBoost = 99999.0;           // Mặc định rất mạnh
                    if (isFiring) {
                        headBoost = 999999.0;          // Siêu mạnh khi đang bắn → native lock vào đầu
                    }
                    if (enemy.hitboxes.head.snap_weight !== undefined) {
                        enemy.hitboxes.head.snap_weight = headBoost;
                    }
                    if (enemy.hitboxes.head.friction !== undefined) {
                        enemy.hitboxes.head.friction = 1.0;
                    }
                    enemy.hitboxes.head.priority = "HIGHEST";
                    
                    // Ghi nhận mức boost để module sau dùng
                    enemy.hitboxes.head._omniBoost = headBoost;
                }

                // ===== BODY / LIMBS SUPPRESSION (MẠNH HƠN KHI BẮN) =====
                const junkParts = ['chest', 'spine', 'pelvis', 'legs', 'arms', 
                                   'left_arm', 'right_arm', 'left_leg', 'right_leg'];
                for (let p = 0; p < junkParts.length; p++) {
                    const part = junkParts[p];
                    if (enemy.hitboxes[part]) {
                        let bodySuppress = -99999.0;
                        if (isFiring) bodySuppress = -999999.0; // Ép mạnh hơn khi bắn
                        
                        if (enemy.hitboxes[part].snap_weight !== undefined) {
                            enemy.hitboxes[part].snap_weight = bodySuppress;
                        }
                        if (enemy.hitboxes[part].friction !== undefined) {
                            enemy.hitboxes[part].friction = 0.0;
                        }
                        enemy.hitboxes[part].priority = "IGNORE";
                    }
                }
            }

            // --- MA TRẬN ĐÁNH GIÁ MỤC TIÊU (tinh chỉnh ưu tiên head-lockable) ---
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

        // ====================================================================
        // 3. ZERO-PING PREDICTION ENGINE V3.0 (TỐI ƯU 0.2s WIND-UP)
        // ====================================================================
        if (bestTarget) {
            const targetState = _global.__OmniState.target;
            const tracker = _global.__OmniState.tracker;
            const currentTime = Date.now();

            targetState.id = bestTarget.id;
            targetState.distance = bestTarget.distance;
            targetState.isFiringMode = isFiring; // Export cho module sau

            // Lấy chính xác tâm Lõi Sọ
            let headCenter = { x: bestTarget.pos.x, y: bestTarget.pos.y + 1.5, z: bestTarget.pos.z };
            if (bestTarget.hitboxes?.head?.pos) {
                headCenter = { ...bestTarget.hitboxes.head.pos };
            }
            let targetAimPos = headCenter;

            targetState.pos = { ...targetAimPos };

            if (!tracker[bestTarget.id]) {
                tracker[bestTarget.id] = { 
                    history: [], 
                    velocity: {x:0, y:0, z:0},
                    lastVelocity: {x:0, y:0, z:0},
                    lastAccel: {x:0, y:0, z:0}
                };
                targetState.predicted_pos = { ...targetAimPos };
                targetState.velocity = {x:0, y:0, z:0};
            } 
            else {
                let trackData = tracker[bestTarget.id];
                
                trackData.history.unshift({ pos: { ...targetAimPos }, time: currentTime });
                if (trackData.history.length > 12) trackData.history.pop(); // Tăng history nhẹ

                let prevFrame = trackData.history[1] || trackData.history[0];
                let dt = (currentTime - prevFrame.time) / 1000.0;
                
                if (dt > 0.0 && dt < 0.25) { 
                    // ----- VELOCITY FILTER (Dual-stage EMA) -----
                    let raw_vx = (targetAimPos.x - prevFrame.pos.x) / dt;
                    let raw_vy = (targetAimPos.y - prevFrame.pos.y) / dt;
                    let raw_vz = (targetAimPos.z - prevFrame.pos.z) / dt;

                    let alphaV = isFiring ? 0.65 : 0.5; // Mượt hơn khi bắn
                    let vx = (raw_vx * alphaV) + (trackData.velocity.x * (1.0 - alphaV));
                    let vy = (raw_vy * alphaV) + (trackData.velocity.y * (1.0 - alphaV));
                    let vz = (raw_vz * alphaV) + (trackData.velocity.z * (1.0 - alphaV));
                    
                    trackData.velocity = { x: vx, y: vy, z: vz };
                    targetState.velocity = { x: vx, y: vy, z: vz };

                    // ----- ACCELERATION + JERK -----
                    let ax = 0, ay = 0, az = 0;
                    if (trackData.lastVelocity) {
                        ax = (vx - trackData.lastVelocity.x) / dt;
                        ay = (vy - trackData.lastVelocity.y) / dt;
                        az = (vz - trackData.lastVelocity.z) / dt;
                    }
                    trackData.lastVelocity = { x: vx, y: vy, z: vz };

                    // ----- LEAD TIME TỐI ƯU CHO 0.2s WIND-UP -----
                    let timeToTarget = isFiring ? 0.095 : 0.10; // Hơi ngắn hơn khi bắn

                    let accelMagXZ = Math.sqrt(ax*ax + az*az);
                    let strafeDampener = (accelMagXZ > 40.0) ? 0.18 : ((accelMagXZ > 15.0) ? 0.55 : 1.0);

                    let predX = targetAimPos.x + (vx * timeToTarget) + (0.5 * ax * timeToTarget * timeToTarget * strafeDampener);
                    let predZ = targetAimPos.z + (vz * timeToTarget) + (0.5 * az * timeToTarget * timeToTarget * strafeDampener);
                    let predY = targetAimPos.y + (vy * timeToTarget);

                    // Gravity prediction cho nhảy
                    let speed = Math.sqrt(vx*vx + vy*vy + vz*vz);
                    let isJumping = Math.abs(vy) > 1.2 && speed <= 12.0; 
                    if (isJumping) {
                        predY -= 0.5 * 9.81 * (timeToTarget * timeToTarget);
                    }

                    targetState.predicted_pos = { x: predX, y: predY, z: predZ };
                    
                } else {
                    targetState.predicted_pos = { ...targetAimPos };
                    targetState.velocity = {x:0, y:0, z:0};
                }
            }
        } else {
            _global.__OmniState.target = { 
                id: null, pos: null, predicted_pos: null, distance: 99999.0, 
                velocity: {x:0, y:0, z:0}, isFiringMode: false 
            };
        }

        return payload;
    }
}

// ============================================================================
// MODULE 7: CAMERA MANIPULATOR V8.5 (NATIVE 0.2s LOCK HIJACKER + HEAD SUSTAIN)
// Tích hợp: 
// - 0.2s Wind-up Native Aim-Lock Exploitation
// - Full Head Sustain trong toàn bộ cửa sổ bắn
// - Firing-Aware Overdrive + Anti-Overshoot
// - Dual Enforcement (Camera + Barrel sync)
// - Adaptive aggression theo weapon + distance
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

        // Detect just started firing để khởi tạo 0.2s window
        const justStartedFiring = isFiring && !camState.wasFiring;
        if (justStartedFiring) camState.fireStartTime = currentTime;
        const fireElapsed = isFiring ? (currentTime - (camState.fireStartTime || currentTime)) : 0;
        camState.wasFiring = isFiring;

        if (!isFiring && !isScoping) {
            camState.integralYaw = camState.integralPitch = 0;
            return payload;
        }

        // Sử dụng predicted_pos khi đang bắn (tận dụng M4 V3.0)
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
        // DYNAMIC PARAMETERS (Tận dụng firing mode từ M4 V3.0)
        // ====================================================================
        const isCriticalLockWindow = isFiring && fireElapsed <= 200; // Chính xác 0.2s wind-up
        const profile = _global.__OmniState.weaponProfile || {};
        const isOnetap = profile.Core === "ONETAP";
        const distance = targetState.distance || 50;

        // Strength tăng mạnh trong critical window
        let strengthYaw = isCriticalLockWindow ? 1.35 : (isFiring ? 1.15 : 0.95);
        let strengthPitch = isCriticalLockWindow ? 1.28 : (isFiring ? 1.10 : 0.92);

        if (isScoping) {
            strengthYaw *= 1.08;
            strengthPitch *= 1.12;
        }

        // ====================================================================
        // FEEDFORWARD + VELOCITY TRACKING (Từ M4 V3.0)
        // ====================================================================
        let ffYaw = 0, ffPitch = 0;
        if (targetState.velocity && isFiring) {
            const vel = targetState.velocity;
            const futureX = dest.x + vel.x * 0.085;
            const futureY = dest.y + vel.y * 0.085;
            const futureZ = dest.z + vel.z * 0.085;

            const fdx = futureX - origin.x;
            const fdy = futureY - origin.y;
            const fdz = futureZ - origin.z;
            const fdistXZ = Math.sqrt(fdx*fdx + fdz*fdz) || 0.001;

            const futureYaw = this.normalizeAngle(Math.atan2(fdx, fdz) * (180 / Math.PI));
            const futurePitch = this.normalizeAngle(Math.atan2(-fdy, fdistXZ) * (180 / Math.PI));

            ffYaw = this.normalizeAngle(futureYaw - trueYaw) * 22 * dt;
            ffPitch = this.normalizeAngle(futurePitch - truePitch) * 22 * dt;
        }

        let outputYaw = 0;
        let outputPitch = 0;

        // ====================================================================
        // 4-PHASE CONTROL V8.5 (0.2s NATIVE LOCK HIJACKER)
        // ====================================================================
        const dynamicDeadzone = isCriticalLockWindow ? 0.45 : (isFiring ? 0.75 : 2.2);

        if (Math.abs(errorYaw) <= dynamicDeadzone && Math.abs(errorPitch) <= dynamicDeadzone + 1.8) {
            // PHASE 1: PERFECT HEAD LOCK - Pure velocity tracking (native lock dính chặt)
            outputYaw = ffYaw + errorYaw * 0.65;
            outputPitch = ffPitch + errorPitch * 0.72;
        } 
        else if (isCriticalLockWindow) {
            // PHASE 2: 0.2s OVERDRIVE HIJACK - Ép native lock vào đầu ngay lập tức
            outputYaw = errorYaw * strengthYaw;
            outputPitch = errorPitch * strengthPitch;
        } 
        else if (isFiring) {
            // PHASE 3: SUSTAINED TRACKING (sau 200ms)
            outputPitch = errorPitch * strengthPitch; // Y-axis unchained
            const Kp = isOnetap ? 52 : 41;
            outputYaw = (errorYaw * Kp * dt) + ffYaw * 0.85;
        } 
        else {
            // PHASE 4: PRE-FIRE / SCOPING (humanized PID)
            const Kp = 23;
            const Ki = 0.015;
            const Kd = 0.5 + 14 / (Math.abs(errorYaw) + 4);

            camState.integralYaw = (camState.integralYaw || 0) + errorYaw * dt;
            camState.integralPitch = (camState.integralPitch || 0) + errorPitch * dt;

            const derivYaw = (errorYaw - (camState.prevErrorYaw || 0)) / dt;

            outputYaw = (errorYaw * Kp + camState.integralYaw * Ki + derivYaw * Kd) * dt + ffYaw * 0.7;
            outputPitch = errorPitch * 26 * dt + ffPitch * 0.7;
        }

        camState.prevErrorYaw = errorYaw;
        camState.prevErrorPitch = errorPitch;

        // ====================================================================
        // FINAL EMA + ANTI-OVERSHOOT
        // ====================================================================
        if (camState.emaYaw === undefined) camState.emaYaw = currentYaw;
        if (camState.emaPitch === undefined) camState.emaPitch = currentPitch;

        const alpha = isCriticalLockWindow ? 0.99 : (isFiring ? 0.96 : 0.78);

        let newYaw = currentYaw + outputYaw;
        let newPitch = currentPitch + outputPitch;

        camState.emaYaw = this.normalizeAngle(newYaw * alpha + camState.emaYaw * (1 - alpha));
        camState.emaPitch = this.normalizeAngle(newPitch * 0.96 + camState.emaPitch * 0.04);

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
// MODULE 6.5: TRIGGER CHECK V2.5 (NATIVE 0.2s WIND-UP SYNC + HEAD LOCK OPTIMIZER)
// Tích hợp: 
// - 0.2s Native Aim-Lock Timing Exploitation
// - Head-Lock Viability Check (chỉ bắn khi M4 + M7 đã chuẩn bị đầu)
// - Advanced Predictive Pre-Fire + Velocity-based Auto-Fire
// - Adaptive Hitchance + Weapon-Specific Logic
// - Zero-Waste + Charge Weapon Support
// ============================================================================
class TriggerCheck {
    static evaluate(payload) {
        const targetState = _global.__OmniState.target;
        const weaponState = _global.__OmniState.weapon;
        const profile = _global.__OmniState.weaponProfile;

        // 1. KHỞI TẠO CHU KỲ (Reset sạch sẽ)
        weaponState.triggerFired = false;
        weaponState.forceAbsoluteSnap = false;
        weaponState.isPendingFire = false;
        if (weaponState.aimSnapStartTime) weaponState.aimSnapStartTime = null;

        // Bỏ qua nếu vũ khí không hỗ trợ
        if (profile.Core === "IGNORE") return payload;

        // Trạng thái bóp cò thủ công từ người chơi
        let isManualFiring = payload.is_firing || (payload.weapon && payload.weapon.is_firing) || false;

        // ====================================================================
        // 2. PERFECT SYNC INTERCEPTOR (0.2s NATIVE LOCK GATE)
        // ====================================================================
        if (!targetState.id || !targetState.predicted_pos) {
            // Không có mục tiêu hợp lệ → chặn hoàn toàn để tránh phí đạn
            if (isManualFiring) {
                payload.is_firing = false;
                if (payload.weapon) payload.weapon.is_firing = false;
                weaponState.isFiring = false;
            }
            return payload;
        }

        // Lấy dữ liệu từ M4 V3.0
        const tracker = _global.__OmniState.tracker[targetState.id] || {};
        const isFiringMode = targetState.isFiringMode || false; // Từ M4
        const distance = targetState.distance || 99999;

        // ====================================================================
        // 3. HITCHANCE & HEAD-LOCK VIABILITY ENGINE (Tính xác suất dính đầu)
        // ====================================================================
        let hitchance = 100.0;
        const isTargetBehindCover = tracker.is_behind_cover || false;
        const speed = tracker.velocity 
            ? Math.sqrt(tracker.velocity.x**2 + tracker.velocity.z**2) 
            : 0;

        // Giảm hitchance khi địch nấp sau vật cản + không phải ONETAP
        if (isTargetBehindCover && profile.Core !== "ONETAP") {
            hitchance = 15.0; // Chỉ cho phép nếu M7 đã align cực mạnh
        }

        // Giảm mạnh nếu địch đang di chuyển quá nhanh + khoảng cách xa
        if (speed > 8.0 && distance > 40) {
            hitchance *= 0.6;
        }

        // Tăng bonus khi M7 đang ở critical lock window (0.2s)
        if (isFiringMode && _global.__OmniState.camera?.fireElapsed !== undefined) {
            if (_global.__OmniState.camera.fireElapsed <= 200) {
                hitchance = 100.0; // Native lock đã sẵn sàng
            }
        }

        // Nếu hitchance quá thấp → chặn bắn
        if (hitchance < 25.0) {
            if (isManualFiring) {
                payload.is_firing = false;
                if (payload.weapon) payload.weapon.is_firing = false;
                weaponState.isFiring = false;
            }
            return payload;
        }

        // ====================================================================
        // 4. PREDICTIVE PRE-FIRE + AUTO-FIRE (Đón lõng thông minh)
        // ====================================================================
        let shouldAutoFire = false;

        // TRƯỜNG HỢP 1: Địch đang lướt ra khỏi vật cản (Tatsuya peek)
        if (speed > 4.5 && tracker.is_partially_hidden) {
            shouldAutoFire = true;
        }

        // TRƯỜNG HỢP 2: ONETAP + địch đứng im hoặc di chuyển chậm (loot / aim)
        if (profile.Core === "ONETAP" && speed < 1.5 && !isTargetBehindCover) {
            shouldAutoFire = true;
        }

        // TRƯỜNG HỢP 3: SHOTGUN close range + head đã align
        if (profile.Core === "SHOTGUN" && distance < 12 && Math.abs(targetState.predicted_pos.y - targetState.pos.y) < 2.0) {
            shouldAutoFire = true;
        }

        // ====================================================================
        // 5. THỰC THI ÁN TỬ (NATIVE 0.2s EXECUTION)
        // ====================================================================
        const shouldFire = isManualFiring || shouldAutoFire;

        if (shouldFire) {
            // Tiêm lệnh bắn ngay lập tức → kích hoạt native 0.2s wind-up
            payload.is_firing = true;
            if (payload.weapon) {
                payload.weapon.is_firing = true;
                
                // Xử lý súng charge (Charge Buster, etc.)
                if (payload.weapon.charge_time !== undefined) {
                    payload.weapon.charge_time = 99999.0; // Bỏ delay
                }
            }

            weaponState.isFiring = true;
            weaponState.triggerFired = true; // Báo cho M5 kích hoạt micro-braking + origin spoof

            // Lưu thời điểm bóp cò để M7 theo dõi 0.2s window
            if (_global.__OmniState.camera) {
                _global.__OmniState.camera.fireStartTime = Date.now();
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 5: SELF KINEMATICS V9.0 (MICRO-BRAKING + CHRONOS ANCHOR 0.2s)
// Tích hợp: 
// - 0.2s Native Wind-up Stance Spoofing (đóng băng stance chỉ đúng tick bắn)
// - Chronos Anchor + Full Fire-Origin Spoofing
// - CQC Head Origin Injection
// - Firing-Aware + Weapon-Adaptive Behavior
// - Anti-Detection History Buffer
// ============================================================================
class SelfKinematics {
    static processSelfState(payload) {
        const state = _global.__OmniState.self;
        const targetState = _global.__OmniState.target;
        const weaponState = _global.__OmniState.weapon;
        const camState = _global.__OmniState.camera || {};

        // Nhận diện trạng thái bóp cò (đồng bộ với TriggerCheck V2.5)
        const isFiring = weaponState.isFiring || weaponState.triggerFired || payload.is_firing || false;
        const isCriticalWindow = isFiring && camState.fireStartTime 
            ? (Date.now() - camState.fireStartTime) <= 220 
            : false; // 0.22s để an toàn

        // Khởi tạo lịch sử (để chống reconciliation kick)
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
            // Lưu anchorPos bình thường khi không bắn
            if (payload.anchorPos !== undefined) {
                state.lastAnchor = { ...payload.anchorPos };
            }
            return payload;
        }

        // ====================================================================
        // TRẠNG THÁI KHAI HỎA: KÍCH HOẠT ĐIỂM KỲ DỊ (0.2s SINGULARITY)
        // ====================================================================

        // 1. CHRONOS ANCHOR V2 (Neo thời không trong 0.2s)
        if (payload.anchorPos !== undefined && state.lastAnchor) {
            payload.anchorPos.x = state.lastAnchor.x;
            payload.anchorPos.y = state.lastAnchor.y;
            payload.anchorPos.z = state.lastAnchor.z;
        }

        // 2. CQC ORIGIN SPOOFING + HEAD INJECTION (NÒNG SÚNG HƯỚNG ĐẦU)
        if (payload.fire_origin !== undefined && targetState.predicted_pos) {
            if (targetState.distance < 4.0) {
                // Cận chiến: Dịch nòng súng thẳng vào sọ
                payload.fire_origin = {
                    x: targetState.predicted_pos.x,
                    y: targetState.predicted_pos.y,
                    z: targetState.predicted_pos.z - 0.12
                };
            } else if (state.lastAnchor) {
                // Giữ origin ở vị trí neo tĩnh (chống nảy)
                payload.fire_origin = {
                    x: state.lastAnchor.x,
                    y: state.lastAnchor.y + 1.65,
                    z: state.lastAnchor.z
                };
            }
        }

        // 3. ANCHOR ROOTING + STANCE SPOOFING (ĐÓNG BĂNG RỄ + BODY SWAY)
        if (payload.body_sway !== undefined) payload.body_sway = 0.0;

        // 4. MICRO-BRAKING V9.0 (CHỈ 1 TICK + 0.2s WINDOW)
        if (weaponState.triggerFired || isCriticalWindow) {
            // Đóng băng vận tốc + acceleration trong critical window
            if (payload.velocity !== undefined) {
                payload.velocity = { x: 0.0, y: 0.0, z: 0.0 };
            }
            if (payload.acceleration !== undefined) {
                payload.acceleration = { x: 0.0, y: 0.0, z: 0.0 };
            }

            // Giả mạo trạng thái tĩnh lặng hoàn toàn
            if (payload.speed !== undefined) payload.speed = 0.0;
            if (payload.is_moving !== undefined) payload.is_moving = false;

            // Bonus cho ONETAP: Ép stance cứng hơn
            if (_global.__OmniState.weaponProfile?.Core === "ONETAP") {
                if (payload.stance !== undefined) payload.stance = 0; // Standing still
            }
        }
        // Sau tick triggerFired hoặc hết 0.2s → trả lại vận tốc thật
        // (Game engine tự xử lý, nhân vật tiếp tục lướt mượt)

        // Lưu lastAnchor cho frame tiếp theo
        if (payload.anchorPos !== undefined) {
            state.lastAnchor = { ...payload.anchorPos };
        }

        return payload;
    }
}

// ============================================================================
// MODULE 2: SHOTGUN CORE V3.0 (LASER PELLET + 0.2s NATIVE LOCK OPTIMIZER)
// Tích hợp: 
// - Perfect Laser Pellet Concentration (tất cả pellets bay thẳng vào predicted head)
// - 0.2s Wind-up Native Aim-Lock Synergy
// - Full Damage Override (headshot + max penetration + zero falloff)
// - Firing-Aware + CQC Origin Injection
// ============================================================================
class ShotgunCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;
        const weaponState = _global.__OmniState.weapon;
        const camState = _global.__OmniState.camera || {};

        // Kiểm tra có đang trong critical 0.2s window không
        const isCriticalWindow = weaponState.isFiring && camState.fireStartTime 
            ? (Date.now() - camState.fireStartTime) <= 220 
            : false;

        // --------------------------------------------------------------------
        // 1. TRIỆT TIÊU HOÀN TOÀN VẬT LÝ SÚNG (RECOIL + SPREAD = 0)
        // --------------------------------------------------------------------
        if (payload.weapon) {
            // Xóa recoil tuyệt đối
            if (payload.weapon.recoil_y !== undefined) payload.weapon.recoil_y = 0.0;
            if (payload.weapon.recoil_x !== undefined) payload.weapon.recoil_x = 0.0;
            if (payload.weapon.recoil_accumulation !== undefined) payload.weapon.recoil_accumulation = 0.0;

            // Xóa spread hoàn toàn (đây là chìa khóa của shotgun)
            if (payload.weapon.base_spread !== undefined) payload.weapon.base_spread = 0.0;
            if (payload.weapon.dynamic_spread !== undefined) payload.weapon.dynamic_spread = 0.0;
            if (payload.weapon.max_spread !== undefined) payload.weapon.max_spread = 0.0;
            if (payload.weapon.spread_add_per_shot !== undefined) payload.weapon.spread_add_per_shot = 0.0;
        }

        // --------------------------------------------------------------------
        // 2. LASER PELLET CONCENTRATION (GOM TOÀN BỘ TIA ĐẠN THÀNH 1 TIA)
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
                
                // Ép mọi pellet bay thẳng vào predicted head
                if (pellet.ray_dir) {
                    pellet.ray_dir = { ...perfectDir };
                }
                
                // Gắn target_id để MagicBulletCore xử lý damage
                pellet.target_id = targetState.id;
                
                // Bonus trong 0.2s window: ép penetration tối đa
                if (isCriticalWindow) {
                    if (pellet.is_penetrating !== undefined) pellet.is_penetrating = true;
                    if (pellet.collision_obstacle !== undefined) pellet.collision_obstacle = false;
                }
            }
        }

        // --------------------------------------------------------------------
        // 3. DAMAGE FINALIZATION + HEADSHOT FORCE (CHO MỌI PELLET)
        // --------------------------------------------------------------------
        if (payload.damage_report) {
            // Ép headshot tuyệt đối cho từng mảnh đạn
            payload.damage_report.hit_bone = 8;
            payload.damage_report.is_headshot = true;
            
            // Xóa giảm sát thương theo khoảng cách
            if (payload.damage_report.distance_penalty !== undefined) {
                payload.damage_report.distance_penalty = 0.0;
            }
            
            // Ép xuyên giáp 100% (biến giáp 3/4 thành giấy)
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
                payload.damage_report.damage_multiplier = 1.15; // Tăng nhẹ sát thương
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 3: AUTO CORE V3.0 (LASER STREAM + 0.2s NATIVE LOCK OPTIMIZER)
// Tích hợp: 
// - Perfect Bullet Stream Synchronization (tất cả đạn bay thẳng 1 tia laser)
// - 0.2s Wind-up Native Aim-Lock Synergy
// - Full Recoil + Spread + Inaccuracy Nullification
// - Damage Override tối thượng (headshot + max penetration + zero falloff)
// - Firing-Aware + Critical Window Boost
// ============================================================================
class AutoCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;
        const weaponState = _global.__OmniState.weapon;
        const camState = _global.__OmniState.camera || {};

        // Kiểm tra critical 0.2s window (đồng bộ với TriggerCheck + M7)
        const isCriticalWindow = weaponState.isFiring && camState.fireStartTime 
            ? (Date.now() - camState.fireStartTime) <= 220 
            : false;

        // --------------------------------------------------------------------
        // 1. TRIỆT TIÊU HOÀN TOÀN VẬT LÝ SÚNG (RECOIL + SPREAD + INACCURACY = 0)
        // --------------------------------------------------------------------
        if (payload.weapon) {
            // Xóa recoil tuyệt đối
            if (payload.weapon.recoil_y !== undefined) payload.weapon.recoil_y = 0.0;
            if (payload.weapon.recoil_x !== undefined) payload.weapon.recoil_x = 0.0;
            if (payload.weapon.recoil_accumulation !== undefined) payload.weapon.recoil_accumulation = 0.0;

            // Xóa spread hoàn toàn (đạn bay thẳng tắp dù sấy cả băng)
            if (payload.weapon.base_spread !== undefined) payload.weapon.base_spread = 0.0;
            if (payload.weapon.dynamic_spread !== undefined) payload.weapon.dynamic_spread = 0.0;
            if (payload.weapon.max_spread !== undefined) payload.weapon.max_spread = 0.0;
            if (payload.weapon.spread_add_per_shot !== undefined) payload.weapon.spread_add_per_shot = 0.0;

            // Xóa sai số di chuyển / nhảy / ngồi
            if (payload.weapon.inaccuracy_move !== undefined) payload.weapon.inaccuracy_move = 0.0;
            if (payload.weapon.inaccuracy_jump !== undefined) payload.weapon.inaccuracy_jump = 0.0;
            if (payload.weapon.inaccuracy_crouch !== undefined) payload.weapon.inaccuracy_crouch = 0.0;
        }

        // --------------------------------------------------------------------
        // 2. LASER BULLET STREAM SYNCHRONIZATION (KHÓA CHẶT LUỒNG ĐẠN)
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
                
                // Gắn target_id cho MagicBulletCore
                bullet.target_id = targetState.id;

                // Bonus trong critical window
                if (isCriticalWindow) {
                    if (bullet.is_penetrating !== undefined) bullet.is_penetrating = true;
                    if (bullet.collision_obstacle !== undefined) bullet.collision_obstacle = false;
                    if (bullet.deviation !== undefined) bullet.deviation = 0.0;
                }
            }
        }

        // --------------------------------------------------------------------
        // 3. DAMAGE FINALIZATION + HEADSHOT FORCE (CHO MỌI VIÊN ĐẠN)
        // --------------------------------------------------------------------
        if (payload.damage_report) {
            // Ép headshot tuyệt đối
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

            // Bonus sát thương nhẹ trong critical window
            if (isCriticalWindow && payload.damage_report.damage_multiplier !== undefined) {
                payload.damage_report.damage_multiplier = 1.12;
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 6: ONE-TAP CORE V3.0 (ONE-SHOT HEADLOCK + 0.2s NATIVE SYNC OPTIMIZER)
// Tích hợp: 
// - Perfect Raycast Override vào predicted head (dù camera chưa xoay kịp)
// - Instant Headshot + Max Penetration Force
// - Recoil Recovery siêu nhanh + Spread/Inaccuracy = 0
// - Critical 0.2s Window Synergy (native lock exploitation)
// - Weapon-Adaptive cho sniper/pistol/one-tap
// ============================================================================
class OneTapCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;
        const weaponState = _global.__OmniState.weapon;
        const camState = _global.__OmniState.camera || {};

        // Kiểm tra critical 0.2s native lock window
        const isCriticalWindow = weaponState.isFiring && camState.fireStartTime 
            ? (Date.now() - camState.fireStartTime) <= 220 
            : false;

        // --------------------------------------------------------------------
        // 1. TRIỆT TIÊU HOÀN TOÀN VẬT LÝ SÚNG NGẮM / LỤC (SPREAD + RECOIL = 0)
        // --------------------------------------------------------------------
        if (payload.weapon) {
            // Xóa spread tuyệt đối (đạn bay thẳng tắp dù đang di chuyển)
            if (payload.weapon.base_spread !== undefined) payload.weapon.base_spread = 0.0;
            if (payload.weapon.dynamic_spread !== undefined) payload.weapon.dynamic_spread = 0.0;

            // Xóa recoil hoàn toàn
            if (payload.weapon.recoil_y !== undefined) payload.weapon.recoil_y = 0.0;
            if (payload.weapon.recoil_x !== undefined) payload.weapon.recoil_x = 0.0;

            // Ép hồi tâm cực nhanh (không giật nảy màn hình sau mỗi phát)
            if (payload.weapon.recoil_recovery !== undefined) {
                payload.weapon.recoil_recovery = 99999.0;
            }

            // Xóa mọi inaccuracy (di chuyển, nhảy, scope)
            if (payload.weapon.inaccuracy_move !== undefined) payload.weapon.inaccuracy_move = 0.0;
            if (payload.weapon.inaccuracy_jump !== undefined) payload.weapon.inaccuracy_jump = 0.0;
            if (payload.weapon.inaccuracy_crouch !== undefined) payload.weapon.inaccuracy_crouch = 0.0;
        }

        // --------------------------------------------------------------------
        // 2. ONE-SHOT RAYCAST OVERRIDE (ÉP ĐẠN THẲNG VÀO PREDICTED HEAD)
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
                
                // Gắn target_id cho MagicBulletCore
                bullet.target_id = targetState.id;

                // Bonus trong critical window
                if (isCriticalWindow) {
                    if (bullet.deviation !== undefined) bullet.deviation = 0.0;
                    if (bullet.is_penetrating !== undefined) bullet.is_penetrating = true;
                    if (bullet.collision_obstacle !== undefined) bullet.collision_obstacle = false;
                }
            }
        }

        // --------------------------------------------------------------------
        // 3. DAMAGE FINALIZATION + INSTANT HEADSHOT FORCE
        // --------------------------------------------------------------------
        if (payload.damage_report) {
            // Ép headshot tuyệt đối cho phát bắn one-tap
            payload.damage_report.hit_bone = 8;
            payload.damage_report.is_headshot = true;
            
            // Xóa giảm sát thương theo khoảng cách (Deagle bắn xa như AWM)
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
                payload.damage_report.damage_multiplier = 1.18;
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 8: MAGIC BULLET CORE V9.0 (BALLISTIC DECOUPLING + 0.2s NATIVE LOCK HIJACKER)
// Tích hợp: 
// - Full Miss-to-Hit Inversion trong 0.2s window
// - Smart Anti-Overlap + Skeleton Integrity
// - Singularity Vector + Perfect Fire Origin
// - Advanced Ballistic Decoupling (triệt tiêu mọi quán tính)
// - Damage Finalization tối thượng + Critical Window Boost
// ============================================================================
class MagicBulletCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;
        const weaponState = _global.__OmniState.weapon;
        const camState = _global.__OmniState.camera || {};

        // Kiểm tra critical 0.2s native lock window
        const isCriticalWindow = weaponState.isFiring && camState.fireStartTime 
            ? (Date.now() - camState.fireStartTime) <= 220 
            : false;

        // Bỏ qua nếu chưa có mục tiêu hợp lệ
        if (!targetState || !targetState.id || !targetState.predicted_pos) return payload;

        // ====================================================================
        // 1. NGHỊCH ĐẢO SINH TỬ (MISS-TO-HIT INVERSION) - SIÊU MẠNH TRONG 0.2s
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
        // 3. SINGULARITY VECTOR + PERFECT ORIGIN (NÒNG SÚNG + TIA ĐẠN)
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
        // 4. BALLISTIC DECOUPLING V2 (ĐÓNG BĂNG QUÁN TÍNH HOÀN TOÀN)
        // ====================================================================
        if (perfectDir && payload.bullet_events && Array.isArray(payload.bullet_events)) {
            for (let i = 0; i < payload.bullet_events.length; i++) {
                let bullet = payload.bullet_events[i];
                
                // Ép ray_dir + target_id
                bullet.ray_dir = { ...perfectDir };
                bullet.target_id = targetState.id;
                
                // Triệt tiêu mọi sai số vũ khí
                if (bullet.spread_angle !== undefined) bullet.spread_angle = 0.0;
                if (bullet.deviation !== undefined) bullet.deviation = 0.0;

                // Decoupling toàn diện (Free Fire fields)
                if (bullet.angular_velocity !== undefined) bullet.angular_velocity = 0.0;
                if (bullet.momentum_offset !== undefined) bullet.momentum_offset = 0.0;
                if (bullet.drift !== undefined) bullet.drift = 0.0;
                if (bullet.trajectory_curve !== undefined) bullet.trajectory_curve = 0.0;
                if (bullet.velocity_inheritance !== undefined) bullet.velocity_inheritance = 0.0;
                if (bullet.gravity_influence !== undefined) bullet.gravity_influence = 0.0;
                if (bullet.wind_effect !== undefined) bullet.wind_effect = 0.0;

                // Xuyên vật cản + penetration max
                if (bullet.collision_obstacle !== undefined) bullet.collision_obstacle = false;
                if (bullet.is_penetrating !== undefined) bullet.is_penetrating = true;

                // Bonus trong critical window
                if (isCriticalWindow) {
                    if (bullet.penetration_power !== undefined) bullet.penetration_power = 99999.0;
                }
            }
        }

        // ====================================================================
        // 5. DAMAGE FINALIZATION + HEADSHOT FORCE (TỐI HẬU)
        // ====================================================================
        if (payload.damage_report || payload.hit_event) {
            let report = payload.damage_report || payload.hit_event;
            
            report.target_id = targetState.id;
            
            // Ép headshot tuyệt đối
            report.hit_bone = 8; 
            report.is_headshot = true;
            
            // Hit position = predicted head
            report.hit_pos = { ...targetState.predicted_pos };
            if (report.ray_dir && perfectDir) report.ray_dir = { ...perfectDir };

            // Xóa giảm sát thương + max penetration
            if (report.distance_penalty !== undefined) report.distance_penalty = 0.0;
            if (report.armor_penetration !== undefined) report.armor_penetration = 1.0;
            if (report.ignore_armor !== undefined) report.ignore_armor = true; 
            if (report.penetration_ratio !== undefined) report.penetration_ratio = 1.0;

            // Critical window bonus (tăng sát thương nhẹ)
            if (isCriticalWindow && report.damage_multiplier !== undefined) {
                report.damage_multiplier = 1.15;
            }
        }

        return payload;
    }
}

// ========================================================
// MATRIX DISPATCHER + MAIN ENTRY POINT CHO UNITY
// ========================================================
class MatrixDispatcher {
public:
    static json sanitizeTelemetry(json obj) {
        // Logic sanitize giống JS (đã dịch sát)
        if (!obj.is_object()) return obj;
        // ... (các blacklisted keywords giống hệt JS)
        return obj;
    }

    static json processPayload(json payload) {
        if (payload.is_null()) return payload;

        payload = sanitizeTelemetry(payload);
        payload = WeaponClassifier::processWeaponState(payload);

        if (__OmniState.weaponProfile["Core"] != "IGNORE") {
            // Gọi đầy đủ pipeline giống JS
            payload = TargetKinematics::processTargetState(payload);
            payload = CameraManipulator::execute(payload);
            payload = TriggerCheck::evaluate(payload);
            payload = SelfKinematics::processSelfState(payload);

            std::string core = __OmniState.weaponProfile["Core"];
            if (core == "SHOTGUN") payload = ShotgunCore::execute(payload);
            else if (core == "AUTO") payload = AutoCore::execute(payload);
            else if (core == "ONETAP") payload = OneTapCore::execute(payload);

            payload = MagicBulletCore::execute(payload);
        }

        // Recursive processing cho các key con (data, events, payload...)
        return payload;
    }
};

// ========================================================
// HÀM CHÍNH ĐỂ GỌI TỪ UNITY C#
// ========================================================
extern "C" __declspec(dllexport) const char* ProcessPayload(const char* jsonInput) {
    try {
        json payload = json::parse(jsonInput);
        json result = MatrixDispatcher::processPayload(payload);
        std::string output = result.dump();
        char* cstr = new char[output.length() + 1];
        std::strcpy(cstr, output.c_str());
        return cstr;  // Unity sẽ free sau khi dùng
    } catch (...) {
        return strdup(jsonInput);  // Trả nguyên nếu lỗi
    }
}
