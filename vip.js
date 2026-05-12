/**
 * ==============================================================================
 * PROJECT: OMNI-MATRIX V5.0 (ABSOLUTE RAGE - CLIENT-SIDE AUTHORITY)
 * Pipeline: Sanitizer -> M1(Gun) -> M4(Eyes) -> M7(Camera) -> Trigger -> M5(Ghost) -> Physics -> M8(Magic)
 * Status: FINAL COMPILATION. UNRESTRICTED RAGE MODE.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);

// ============================================================================
// 0. GLOBAL STATE (BỘ NHỚ ĐỒNG BỘ TỔNG V5.0)
// ============================================================================
if (!_global.__OmniState || _global.__OmniState.version !== "MATRIX_V5.0") {
    _global.__OmniState = {
        version: "MATRIX_V5.0",
        currentPing: 50.0,
        team_id: 1, // Thay đổi theo team id thực tế nếu cần
        weaponProfile: { Core: "AUTO", RequireZeroVelocity: false },
        
        target: { id: null, pos: null, predicted_pos: null, distance: 9999.0 },
        self: { 
            pos: null, anchorPos: {x:0, y:0, z:0}, 
            isPerfectlyStill: false, 
            tickCounter: 0, ghostPos: null 
        },
        
        weapon: { isFiring: false, triggerFired: false, lastFireTime: 0 },
        tracker: {} // Lưu trữ lịch sử di chuyển để Pre-fire
    };
}

// ============================================================================
// MODULE 1: WEAPON CLASSIFIER (Nhận Diện Vũ Khí Cơ Bản)
// ============================================================================
class WeaponClassifier {
    static processWeaponState(payload) {
        if (payload.weapon && payload.weapon.id) {
            const wid = payload.weapon.id;
            // Phân loại nháp (Có thể mở rộng thêm danh sách ID thực tế)
            if (wid === 10 || wid === 11 || wid === 12) _global.__OmniState.weaponProfile.Core = "SHOTGUN";
            else if (wid === 20 || wid === 21) _global.__OmniState.weaponProfile.Core = "ONETAP";
            else if (wid === 99) _global.__OmniState.weaponProfile.Core = "IGNORE"; // Lựu đạn/Cận chiến
            else _global.__OmniState.weaponProfile.Core = "AUTO";
        }
        
        // Nhận diện trạng thái khai hỏa thủ công
        _global.__OmniState.weapon.isFiring = !!(payload.is_firing || (payload.weapon && payload.weapon.is_firing));
        return payload;
    }
}

// ============================================================================
// LÕI VẬT LÝ LITE V5.0 (TỐI ƯU HÓA CPU - ZERO RECOIL/SPREAD)
// ============================================================================
class ShotgunCore {
    static execute(payload) {
        if (payload.weapon) {
            payload.weapon.recoil_y = 0.0; payload.weapon.recoil_x = 0.0; payload.weapon.recoil_accumulation = 0.0;
            payload.weapon.base_spread = 0.0; payload.weapon.dynamic_spread = 0.0; payload.weapon.max_spread = 0.0;
        }
        return payload;
    }
}

class AutoCore {
    static execute(payload) {
        if (payload.weapon) {
            payload.weapon.recoil_y = 0.0; payload.weapon.recoil_x = 0.0; payload.weapon.recoil_accumulation = 0.0;
            payload.weapon.base_spread = 0.0; payload.weapon.dynamic_spread = 0.0; payload.weapon.max_spread = 0.0;
            payload.weapon.spread_add_per_shot = 0.0;
            payload.weapon.inaccuracy_move = 0.0; payload.weapon.inaccuracy_jump = 0.0; payload.weapon.inaccuracy_crouch = 0.0;
        }
        return payload;
    }
}

class OneTapCore {
    static execute(payload) {
        if (payload.weapon) {
            payload.weapon.base_spread = 0.0; payload.weapon.dynamic_spread = 0.0;
            payload.weapon.recoil_y = 0.0; payload.weapon.recoil_x = 0.0;
            if (payload.weapon.recoil_recovery !== undefined) payload.weapon.recoil_recovery = 9999.0;
            payload.weapon.inaccuracy_move = 0.0; payload.weapon.inaccuracy_jump = 0.0;
        }
        return payload;
    }
}

// ============================================================================
// MODULE 4: TARGET KINEMATICS (V5.0 ABSOLUTE Z-LOCK & THREAT MATRIX 2.0)
// ============================================================================
class TargetKinematics {
    static processTargetState(payload) {
        if (payload.anchorPos !== undefined) _global.__OmniState.self.anchorPos = { ...payload.anchorPos };
        else if (payload.pos !== undefined && _global.__OmniState.self.anchorPos.x === 0) _global.__OmniState.self.anchorPos = { ...payload.pos };

        if (!payload || !payload.players || !Array.isArray(payload.players)) return payload;
        const selfState = _global.__OmniState.self;
        if (!selfState.anchorPos || selfState.anchorPos.x === 0) return payload; 

        let bestTarget = null;
        let lowestThreatScore = 999999.0;
        
        for (let i = 0; i < payload.players.length; i++) {
            const enemy = payload.players[i];
            if (enemy.is_dead || enemy.hp <= 0 || enemy.is_knocked) continue;
            if (enemy.team_id !== undefined && enemy.team_id === _global.__OmniState.team_id) continue;
            if (!enemy.pos) continue;

            const dx = enemy.pos.x - selfState.anchorPos.x;
            const dy = enemy.pos.y - selfState.anchorPos.y;
            const dz = enemy.pos.z - selfState.anchorPos.z;
            const distance3D = Math.sqrt(dx*dx + dy*dy + dz*dz);

            if (distance3D > 350.0) continue;

            let threatScore = distance3D; 
            if (enemy.is_firing || enemy.is_aiming) threatScore -= 150.0; 
            if (enemy.is_using_skill) threatScore -= 80.0; 
            
            const hp = enemy.hp || 200.0;
            const maxHp = enemy.max_hp || 200.0;
            threatScore -= ((maxHp - hp) * 1.2); 

            if (threatScore < lowestThreatScore) {
                lowestThreatScore = threatScore;
                bestTarget = enemy;
                bestTarget.distance = distance3D;
            }
        }

        if (bestTarget) {
            const targetState = _global.__OmniState.target;
            targetState.id = bestTarget.id;
            targetState.distance = bestTarget.distance;
            
            let targetAimPos = null;
            if (bestTarget.hitboxes && bestTarget.hitboxes.head && bestTarget.hitboxes.head.pos) {
                targetAimPos = { ...bestTarget.hitboxes.head.pos };
            } else {
                let heightOffset = 1.6; 
                if (bestTarget.stance !== undefined) {
                    if (bestTarget.stance === 1 || bestTarget.stance === "crouch") heightOffset = 0.8;
                    else if (bestTarget.stance === 2 || bestTarget.stance === "prone") heightOffset = 0.25;
                }
                targetAimPos = { x: bestTarget.pos.x, y: bestTarget.pos.y + heightOffset, z: bestTarget.pos.z };
            }
            
            targetState.pos = { ...targetAimPos };
            targetState.predicted_pos = { ...targetAimPos }; // ABSOLUTE Z-LOCK
            
            _global.__OmniState.tracker[bestTarget.id] = {
                lastPos: { ...targetAimPos },
                lastTime: Date.now(),
                velocity: bestTarget.velocity || {x:0, y:0, z:0}
            };
        } else {
            _global.__OmniState.target = { id: null, pos: null, predicted_pos: null, distance: 9999.0 };
        }
        return payload;
    }
}

// ============================================================================
// MODULE 7: CAMERA MANIPULATOR (V5.0 TRUE SILENT AIM)
// ============================================================================
class CameraManipulator {
    static normalizeAngle(angle) {
        while (angle > 180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }

    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const weaponState = _global.__OmniState.weapon;
        if (!targetState.id || !targetState.predicted_pos || payload.aim_yaw === undefined) return payload;

        const isFiring = weaponState.isFiring || weaponState.triggerFired || payload.is_firing;
        if (!isFiring) return payload; // NGẮM CÂM: Chỉ giật màn hình khi nổ súng

        const origin = { 
            x: _global.__OmniState.self.anchorPos.x, 
            y: _global.__OmniState.self.anchorPos.y + 1.6, 
            z: _global.__OmniState.self.anchorPos.z 
        };
        const dest = targetState.predicted_pos;

        const dx = dest.x - origin.x;
        const dy = dest.y - origin.y;
        const dz = dest.z - origin.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz);

        payload.aim_yaw = this.normalizeAngle(Math.atan2(dx, dz) * (180.0 / Math.PI));
        payload.aim_pitch = this.normalizeAngle(Math.atan2(-dy, distXZ) * (180.0 / Math.PI));

        if (payload.camera_state) {
            payload.camera_state.yaw = payload.aim_yaw;
            payload.camera_state.pitch = payload.aim_pitch;
            delete payload.camera_state.target_x;
            delete payload.camera_state.target_y;
            delete payload.camera_state.target_z;
            payload.camera_state.target_x = dest.x;
            payload.camera_state.target_y = dest.y;
            payload.camera_state.target_z = dest.z;
        }
        return payload;
    }
}

// ============================================================================
// MODULE 6.5: TRIGGER CHECK (V5.0 PRE-FIRE & BURST EXECUTIONER)
// ============================================================================
class TriggerCheck {
    static evaluate(payload) {
        const targetState = _global.__OmniState.target;
        const weaponState = _global.__OmniState.weapon;
        const profile = _global.__OmniState.weaponProfile;

        weaponState.triggerFired = false;
        if (profile.Core === "IGNORE") return payload;
        if (!targetState.id || !targetState.predicted_pos) return payload;

        const currentTime = Date.now();
        if (!weaponState.lastFireTime) weaponState.lastFireTime = 0;

        let serverTickDelay = (profile.Core === "ONETAP") ? 600 : 65; 
        let readyToExecute = false;
        let isEnemyPeeking = false;

        const tracker = _global.__OmniState.tracker[targetState.id];
        if (tracker && tracker.velocity) {
            const speed = Math.sqrt(tracker.velocity.x**2 + tracker.velocity.z**2);
            if (speed > 3.0) isEnemyPeeking = true; 
        }

        if (currentTime - weaponState.lastFireTime >= serverTickDelay || isEnemyPeeking) {
            readyToExecute = true;
        }

        if (readyToExecute) {
            payload.is_firing = true;
            if (payload.weapon) {
                payload.weapon.is_firing = true;
                if (payload.weapon.charge_time !== undefined) payload.weapon.charge_time = 9999.0;
            }
            weaponState.isFiring = true;
            weaponState.triggerFired = true; 
            weaponState.lastFireTime = currentTime;
        } else {
            payload.is_firing = false;
            if (payload.weapon) payload.weapon.is_firing = false;
        }
        return payload;
    }
}

// ============================================================================
// MODULE 5: SELF KINEMATICS (V5.0 NETWORK GHOST & DESYNC)
// ============================================================================
class SelfKinematics {
    static processSelfState(payload) {
        const state = _global.__OmniState.self;
        const isFiring = _global.__OmniState.weapon.isFiring || _global.__OmniState.weapon.triggerFired || payload.is_firing;

        if (state.tickCounter === undefined) state.tickCounter = 0;
        if (state.ghostPos === undefined) state.ghostPos = null;

        if (!isFiring) {
            state.tickCounter = 0;
            if (payload.pos !== undefined) state.ghostPos = { ...payload.pos };
            state.isPerfectlyStill = false;
            return payload; 
        }

        state.tickCounter++;
        state.isPerfectlyStill = true;

        if (payload.velocity !== undefined) { payload.velocity.x = 0; payload.velocity.y = 0; payload.velocity.z = 0; }
        if (payload.speed !== undefined) payload.speed = 0.0;
        if (payload.is_airborne !== undefined) payload.is_airborne = false;
        if (payload.is_moving !== undefined) payload.is_moving = false;

        if (payload.pos !== undefined && state.ghostPos) {
            payload.pos.x = state.ghostPos.x;
            payload.pos.z = state.ghostPos.z;
            payload.pos.y = state.ghostPos.y - 1.0; 
        }
        if (payload.anchorPos !== undefined && state.ghostPos) {
            payload.anchorPos.x = state.ghostPos.x;
            payload.anchorPos.z = state.ghostPos.z;
            payload.anchorPos.y = state.ghostPos.y - 1.0;
        }

        if (payload.stance !== undefined) payload.stance = (state.tickCounter % 2 === 0) ? 0 : 1;
        if (payload.body_sway !== undefined) payload.body_sway = 0.0;

        return payload;
    }
}

// ============================================================================
// MODULE 8: MAGIC BULLET CORE (V5.0 MAGNETIC RAYCAST & BONE OVERRIDE)
// ============================================================================
class MagicBulletCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        if (!targetState || !targetState.id || !targetState.predicted_pos) return payload;

        if (payload.miss_event || (payload.bullet_event && payload.bullet_event.is_hit === false)) {
            if (payload.miss_event) { payload.hit_event = { ...payload.miss_event }; delete payload.miss_event; }
            if (payload.bullet_event) payload.bullet_event.is_hit = true;
            if (!payload.hit_event) payload.hit_event = {};
            payload.hit_event.target_id = targetState.id;
        }

        if (payload.players && Array.isArray(payload.players)) {
            for (let i = 0; i < payload.players.length; i++) {
                let enemy = payload.players[i];
                if (enemy.hitboxes) {
                    const bodyParts = ['head', 'chest', 'pelvis', 'legs', 'arms'];
                    for (let p = 0; p < bodyParts.length; p++) {
                        if (enemy.hitboxes[bodyParts[p]]) enemy.hitboxes[bodyParts[p]].radius = 0.01; 
                    }
                }
            }
        }

        let perfectDir = null;
        if (_global.__OmniState.self.anchorPos) {
            let dx = targetState.predicted_pos.x - _global.__OmniState.self.anchorPos.x;
            let dy = targetState.predicted_pos.y - (_global.__OmniState.self.anchorPos.y + 1.6);
            let dz = targetState.predicted_pos.z - _global.__OmniState.self.anchorPos.z;
            let mag = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (mag > 0) perfectDir = { x: dx/mag, y: dy/mag, z: dz/mag };

            if (payload.bullet_events && Array.isArray(payload.bullet_events)) {
                for (let i = 0; i < payload.bullet_events.length; i++) {
                    let bullet = payload.bullet_events[i];
                    if (perfectDir) bullet.ray_dir = { ...perfectDir };
                    bullet.target_id = targetState.id;
                    if (bullet.speed !== undefined) bullet.speed = 99999.0;
                    if (bullet.collision_obstacle !== undefined) bullet.collision_obstacle = false;
                    if (bullet.is_penetrating !== undefined) bullet.is_penetrating = true;
                }
            }
        }

        if (payload.damage_report || payload.hit_event) {
            let report = payload.damage_report || payload.hit_event;
            report.target_id = targetState.id;
            report.hit_bone = 8; 
            report.is_headshot = true;
            report.hit_pos = { ...targetState.predicted_pos };
            if (report.ray_dir && perfectDir) report.ray_dir = { ...perfectDir };
            if (report.distance_penalty !== undefined) report.distance_penalty = 0.0;
            if (report.armor_penetration !== undefined) report.armor_penetration = 1.0;
        }

        return payload;
    }
}

// ============================================================================
// BỘ ĐIỀU PHỐI TỔNG (MATRIX DISPATCHER V5.0)
// ============================================================================
class MatrixDispatcher {
    sanitizeTelemetry(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        const blacklistedKeywords = ['report', 'hackkill', 'cheat', 'telemetry', 'exception', 'T_31_', 'T_33_', 'T_34_'];
        const keys = Object.keys(obj);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (blacklistedKeywords.some(keyword => key.toLowerCase().includes(keyword))) {
                delete obj[key]; continue;
            }
            if (obj[key] && typeof obj[key] === 'object') obj[key] = this.sanitizeTelemetry(obj[key]);
        }
        return obj;
    }

    processPayload(payload) {
        if (!payload) return payload;
        
        // Cập nhật Ping (Không dùng để nội suy nữa, nhưng vẫn giữ để Log)
        if (payload.ping !== undefined) _global.__OmniState.currentPing = payload.ping;
        else if (payload.network && payload.network.latency !== undefined) _global.__OmniState.currentPing = payload.network.latency;

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
                    for (let j = 0; j < payload[key].length; j++) payload[key][j] = this.processPayload(payload[key][j]);
                } else if (typeof payload[key] === 'object') {
                    payload[key] = this.processPayload(payload[key]);
                }
            }
        }
        return payload;
    }
}

// ============================================================================
// KÍCH HOẠT SHADOWROCKET / SURGE INTERCEPTOR LAYER 7
// ============================================================================
if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"weapon"') !== -1 || $response.body.indexOf('"report"') !== -1) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new MatrixDispatcher().processPayload(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body }); 
        }
    } else {
        $done({});
    }
} else if (typeof $request !== "undefined" && $request.body) {
    // Xử lý luồng Request chiều đi (Nếu cần)
    try {
        const payload = JSON.parse($request.body);
        const mutated = new MatrixDispatcher().processPayload(payload);
        $done({ body: JSON.stringify(mutated) });
    } catch (e) {
        $done({ body: $request.body }); 
    }
}
