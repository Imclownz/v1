const SystemConfig = {
    voidWeight: -99999.0,
    maxWeight: 99999.0,
    bulletSpeed: 9999.0,
    basePing: 20
};

class QuantumMath {
    static clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    static getAdaptiveY(distance) {
        if (distance <= 10.0) return 0.68;
        if (distance <= 50.0) return 0.68 - (0.33 * ((distance - 10.0) / 40.0));
        return 0.35;
    }

    static getIntercept(pos, tVel, sVel, dist, ping) {
        const t = (dist / SystemConfig.bulletSpeed) + (ping / 1000.0);
        return {
            x: pos.x + ((tVel.x - sVel.x) * t),
            y: pos.y + ((tVel.y - sVel.y) * t),
            z: pos.z + ((tVel.z - sVel.z) * t)
        };
    }
}

class QuantumEngine {
    static optimizeWeapon(w) {
        if (!w) return;
        
        const zeroParams = [
            'recoil', 'spread', 'progressive_spread', 'recoil_accumulation', 
            'recoil_multiplier', 'bloom', 'horizontal_recoil', 'vertical_recoil', 
            'movement_penalty', 'jump_penalty', 'strafe_penalty', 'camera_shake'
        ];
        
        for (let i = 0; i < zeroParams.length; i++) {
            if (zeroParams[i] in w) w[zeroParams[i]] = 0.0;
        }
        
        if ('aim_assist_range' in w) w.aim_assist_range = 9999.0;
        if ('auto_aim_angle' in w) w.auto_aim_angle = 360.0;
        if ('bullet_speed' in w) w.bullet_speed = SystemConfig.bulletSpeed;
    }

    static hijackHitboxes(hb, dist) {
        if (!hb) return;
        
        const torso = ['root', 'spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips', 'left_arm', 'right_arm', 'left_leg', 'right_leg'];
        const torsoRadius = dist < 12.0 ? 0.0001 : 0.01;
        
        for (let i = 0; i < torso.length; i++) {
            const bone = torso[i];
            if (hb[bone]) {
                hb[bone].snap_weight = SystemConfig.voidWeight;
                hb[bone].priority = "IGNORE";
                hb[bone].m_Radius = torsoRadius;
                hb[bone].friction = 0.0;
            }
        }

        if (hb.head) {
            hb.head.snap_weight = SystemConfig.maxWeight;
            hb.head.priority = "MAXIMUM";
            
            let radiusMulti = 8.0;
            if (dist < 15.0) radiusMulti = 15.0;
            else if (dist > 50.0) radiusMulti = 4.0;
            
            hb.head.m_Radius *= radiusMulti;
            hb.head.vertical_magnetism_multiplier = 5.0;
        }
    }

    static calculateKineticState(player, sVel, ping) {
        if (!player || !player.head_pos || !player.chest_pos || !player.center_of_mass) return;

        const dist = player.distance || 15.0;
        const tVel = player.velocity || { x: 0, y: 0, z: 0 };
        
        const intercept = QuantumMath.getIntercept(player.head_pos, tVel, sVel, dist, ping);
        const deltaY = QuantumMath.getAdaptiveY(dist);

        player.center_of_mass.x = intercept.x;
        player.center_of_mass.z = intercept.z;
        player.center_of_mass.y = player.chest_pos.y + deltaY;

        const safetyOffset = dist > 50.0 ? 0.05 : 0.15;
        const maxY = player.head_pos.y + safetyOffset;
        player.center_of_mass.y = QuantumMath.clamp(player.center_of_mass.y, player.chest_pos.y, maxY);
    }

    static processPayload(data) {
        if (!data || typeof data !== 'object') return data;

        if (data.weapon) this.optimizeWeapon(data.weapon);

        if (Array.isArray(data.players)) {
            const sVel = data.player_velocity || { x: 0, y: 0, z: 0 };
            const ping = data.ping || SystemConfig.basePing;

            for (let i = 0; i < data.players.length; i++) {
                const enemy = data.players[i];
                const dist = enemy.distance || 15.0;
                
                this.hijackHitboxes(enemy.hitboxes, dist);
                this.calculateKineticState(enemy, sVel, ping);
            }

            if (data.players.length > 0 && data.camera_state) {
                data.camera_state.stickiness = 1.0;
                data.camera_state.interpolation = "ZERO";
                data.camera_state.lock_bone = "bone_Head";
                data.camera_state.aim_acceleration = 0.0;
            }
        }

        return data;
    }
}

if (typeof $response !== "undefined" && $response.body) {
    try {
        const payload = JSON.parse($response.body);
        const mutatedPayload = QuantumEngine.processPayload(payload);
        $done({ body: JSON.stringify(mutatedPayload) });
    } catch (e) {
        $done({ body: $response.body });
    }
}
