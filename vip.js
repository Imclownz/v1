/**
 * ==============================================================================
 * QUANTUM REACH v70: THE TELEPORT SNAP (ABSOLUTE PERFECTION)
 * Architecture: Zero-Frame Interpolation + Parabolic Absolute Hijacking
 * Optimization: Instant Snap-to-Head, Zero Transition Time, 100% Precision
 * Status: GOD MODE ACTIVATED - USE WITH EXTREME CAUTION
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 70) {
    _global.__QuantumState = {
        version: 70,
        frameCounter: 0,
        previousVelY: {},
        lastFireRate: 0.15
    };
}

class QuantumMath {
    static getDynamicFrames(distance) {
        return Math.max(2, Math.min(8, Math.round(distance / 10.0))); 
    }

    static predictParabolic(targetPos, targetVel, selfVel, distance) {
        const frames = this.getDynamicFrames(distance);
        const BULLET_SPEED = 99999.0;
        const GRAVITY = -9.81;
        let pos = { ...targetPos };
        let currentVy = targetVel.y;
        const dt = (distance / BULLET_SPEED) + 0.0008; 
        
        for (let i = 0; i < frames; i++) {
            pos.x += (targetVel.x - selfVel.x) * dt;
            pos.z += (targetVel.z - selfVel.z) * dt;
            pos.y += (currentVy - selfVel.y) * dt + 0.5 * GRAVITY * (dt * dt);
            currentVy += GRAVITY * dt;
        }
        return pos;
    }
}

class TeleportEngine {
    constructor() {
        this.godWeight = 99999999.0; // Mức độ cưỡng bức cực đại
        this.voidWeight = -99999999.0;
        this.balanceWeight = 250.0;
        this.IGNORE_KEYS = new Set(['ui', 'inventory', 'audio', 'cosmetics', 'chat', 'minimap']);
        this.ghostBones = ['root', 'spine', 'pelvis', 'hips', 'arm', 'leg', 'shoulder', 'foot', 'hand'];
    }

    getCombatPhase(weapon, camera) {
        let isFiring = false;
        if (weapon && (weapon.is_firing || weapon.recoil_accumulation > 0)) isFiring = true;
        if (camera && camera.is_firing) isFiring = true;
        
        const shotCount = weapon?.shots_fired ?? (weapon?.recoil_accumulation / 0.015 || 0);
        
        if (!isFiring) return 0;
        if (shotCount <= 3.0) return 1; // 3 viên đầu là Teleport Mode
        return 2;
    }

    enforceTeleportZeroPoint(weapon) {
        if (!weapon) return;
        const nullifyProps = ['recoil', 'spread', 'bloom', 'camera_shake', 'weapon_sway'];
        for (let prop of nullifyProps) weapon[prop] = 0.0;

        weapon.aim_assist_range = 800.0;
        weapon.auto_aim_angle = 360.0; // Quét toàn bộ để teleport tức thì
        weapon.bullet_speed = 99999.0;
    }

    warpHitboxes(hitboxes, distance, phase, isAirborne) {
        if (!hitboxes) return;

        for (let bone of this.ghostBones) {
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight;
                hitboxes[bone].m_Radius = 0.000001;
                hitboxes[bone].vertical_magnetism_multiplier = this.voidWeight;
            }
        }

        if (hitboxes.head) {
            hitboxes.head.priority = "MAXIMUM";
            hitboxes.head.m_Radius = distance > 50 ? 45.0 : 25.0;
            
            // TELEPORT MAGNETISM
            if (phase === 1) {
                hitboxes.head.snap_weight = this.godWeight;
                hitboxes.head.horizontal_magnetism_multiplier = this.godWeight;
                hitboxes.head.vertical_magnetism_multiplier = this.godWeight;
                hitboxes.head.friction = this.godWeight;
            } else {
                hitboxes.head.snap_weight = this.balanceWeight;
                hitboxes.head.friction = 120.0;
            }
        }
    }

    processRecursive(node, context = { selfVel: {x:0, y:0, z:0}, phase: 0 }) {
        if (typeof node !== 'object' || node === null) return node;
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) node[i] = this.processRecursive(node[i], context);
            return node;
        }

        if (node.player_velocity) context.selfVel = node.player_velocity;
        context.phase = this.getCombatPhase(node.weapon, node.camera_state);

        if (node.weapon) this.enforceTeleportZeroPoint(node.weapon);

        if (node.players && Array.isArray(node.players)) {
            for (let enemy of node.players) {
                const lastY = _global.__QuantumState.previousVelY[enemy.id] || 0;
                const isAirborne = Math.abs(enemy.velocity?.y || 0) > 1.2;
                
                const interceptPos = QuantumMath.predictParabolic(enemy.head_pos, enemy.velocity, context.selfVel, enemy.distance || 20.0);
                
                enemy.center_of_mass.x = interceptPos.x;
                enemy.center_of_mass.z = interceptPos.z;
                enemy.center_of_mass.y = enemy.head_pos.y - 0.015;

                _global.__QuantumState.previousVelY[enemy.id] = enemy.velocity?.y || 0;
                this.warpHitboxes(enemy.hitboxes, enemy.distance || 20.0, context.phase, isAirborne);
            }
        }

        // CHUYÊN GIA DỊCH CHUYỂN CAMERA (TELEPORT LOGIC)
        if (node.camera_state) {
            if (context.phase === 1) {
                // XÓA BỎ NỘI SUY - CƠ CHẾ TELEPORT
                node.camera_state.interpolation = "ZERO";
                node.camera_state.snap_speed = this.godWeight;
                node.camera_state.stickiness = this.godWeight;
                node.camera_state.lock_bone = "bone_Head";
                node.camera_state.vertical_sensitivity_multiplier = 0.0;
                node.camera_state.max_pitch_velocity = 0.0;
            } else if (context.phase === 2) {
                node.camera_state.interpolation = "ZERO";
                node.camera_state.vertical_sensitivity_multiplier = 0.5;
            }
        }

        for (const key of Object.keys(node)) {
            if (this.IGNORE_KEYS.has(key)) continue;
            if (typeof node[key] === 'object' && !['center_of_mass', 'head_pos', 'velocity', 'hitboxes'].includes(key)) {
                node[key] = this.processRecursive(node[key], context);
            }
        }
        return node;
    }
}

// EXECUTION
if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.includes('"players"') || $response.body.includes('"camera_state"')) {
        try {
            _global.__QuantumState.frameCounter++;
            const payload = JSON.parse($response.body);
            const mutated = new TeleportEngine().processRecursive(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) { $done({ body: $response.body }); }
    } else { $done({ body: $response.body }); }
}
