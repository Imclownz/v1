/**
 * ==============================================================================
 * TARGETING & LOCK-HEAD SYSTEM v50.1 (STANDALONE APEX)
 * Architecture: Direct-Access Engine + Kinetic Slingshot Assist
 * Status: Zero-Latency. Independent Execution (No MobileConfig required).
 * ==============================================================================
 */

class AdvancedMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    static calculateAdaptiveYOffset(distance) {
        if (distance <= 10.0) return 0.68;
        if (distance <= 40.0) {
            const scale = (distance - 10.0) / 30.0;
            return 0.68 - (0.33 * scale);
        }
        if (distance <= 80.0) return 0.35;
        return 0.15;
    }

    static predictIntercept(targetPos, targetVel, selfVel, distance, pingMs) {
        const BULLET_SPEED = 9999.0;
        const timeOffset = (distance / BULLET_SPEED) + (pingMs / 1000.0) + 0.02;
        return {
            x: targetPos.x + ((targetVel.x - selfVel.x) * timeOffset),
            y: targetPos.y + ((targetVel.y - selfVel.y) * timeOffset),
            z: targetPos.z + ((targetVel.z - selfVel.z) * timeOffset)
        };
    }
}

class QuantumReachEngine {
    constructor() {
        this.voidWeight = -99999.0;
        this.singularityWeight = 99999.0;
    }

    enforceZeroNormalization(weapon) {
        if (!weapon) return;
        
        const nullifyProps = [
            'recoil', 'spread', 'camera_shake', 'progressive_spread', 
            'recoil_accumulation', 'recoil_multiplier', 'horizontal_recoil', 
            'vertical_recoil', 'bloom', 'movement_penalty', 'jump_penalty', 'strafe_penalty'
        ];

        for (let i = 0; i < nullifyProps.length; i++) {
            if (nullifyProps[i] in weapon) {
                weapon[nullifyProps[i]] = 0.0;
            }
        }

        if ('aim_assist_range' in weapon) weapon.aim_assist_range = 9999.0;
        if ('auto_aim_angle' in weapon) weapon.auto_aim_angle = 360.0;
        if ('bullet_speed' in weapon) weapon.bullet_speed = 9999.0;
    }

    manipulateHitboxes(hitboxes, distance) {
        if (!hitboxes) return;

        const torso = ['root', 'spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips', 'left_arm', 'right_arm', 'left_leg', 'right_leg'];
        const torsoRadius = distance < 12.0 ? 0.0001 : 0.01;

        for (let i = 0; i < torso.length; i++) {
            const bone = torso[i];
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight;
                hitboxes[bone].priority = "IGNORE";
                hitboxes[bone].m_Radius = torsoRadius;
                hitboxes[bone].friction = 0.0; 
            }
        }

        if (hitboxes.head) {
            let headMultiplier = 8.0;
            if (distance < 15.0) headMultiplier = 15.0;
            else if (distance > 50.0) headMultiplier = 4.0;

            hitboxes.head.snap_weight = this.singularityWeight;
            hitboxes.head.priority = "MAXIMUM";
            hitboxes.head.m_Radius *= headMultiplier;
            hitboxes.head.vertical_magnetism_multiplier = 15.0; 
            hitboxes.head.friction = 0.0;
        }

        if (hitboxes.neck) {
            hitboxes.neck.snap_weight = this.singularityWeight * 0.5;
            hitboxes.neck.priority = "HIGH";
            hitboxes.neck.friction = 0.0;
        }
    }

    injectQuantumIntercept(player, selfVel, ping) {
        if (!player || !player.head_pos || !player.chest_pos || !player.center_of_mass) return;

        const dist = player.distance || 15.0;
        const targetVel = player.velocity || { x: 0, y: 0, z: 0 };
        
        const predictedPos = AdvancedMath.predictIntercept(player.head_pos, targetVel, selfVel, dist, ping);
        const adaptiveY = AdvancedMath.calculateAdaptiveYOffset(dist);

        player.center_of_mass.x = predictedPos.x;
        player.center_of_mass.z = predictedPos.z;
        player.center_of_mass.y = player.chest_pos.y + adaptiveY;
        
        const safetyCeiling = player.head_pos.y + (dist > 40.0 ? 0.05 : 0.15);
        player.center_of_mass.y = AdvancedMath.clamp(player.center_of_mass.y, player.chest_pos.y, safetyCeiling);
    }

    process(data) {
        if (!data || typeof data !== 'object') return data;

        if (data.weapon) {
            this.enforceZeroNormalization(data.weapon);
        }

        if (Array.isArray(data.players)) {
            const selfVel = data.player_velocity || { x: 0, y: 0, z: 0 };
            const pingMs = data.ping || 20;

            for (let i = 0; i < data.players.length; i++) {
                const enemy = data.players[i];
                const dist = enemy.distance || 15.0;
                
                this.manipulateHitboxes(enemy.hitboxes, dist);
                this.injectQuantumIntercept(enemy, selfVel, pingMs);
            }

            if (data.players.length > 0 && data.camera_state) {
                data.camera_state.stickiness = 1.0;
                data.camera_state.interpolation = "ZERO";
                data.camera_state.aim_acceleration = 0.0;
                data.camera_state.lock_bone = "bone_Head";
            }
        }

        return data;
    }
}

// ==============================================================================
// EXECUTION BLOCK
// ==============================================================================
if (typeof $response !== "undefined" && $response.body) {
    try {
        const payload = JSON.parse($response.body);
        const Engine = new QuantumReachEngine();
        const mutatedPayload = Engine.process(payload);
        $done({ body: JSON.stringify(mutatedPayload) });
    } catch (error) {
        $done({ body: $response.body });
    }
}
