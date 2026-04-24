/**
 * ENTERPRISE-GRADE: TARGETING & LOCK-HEAD SYSTEM v47.0
 * Architecture: True Legacy v46 + Adaptive Volumetric Hijacking
 * Focus: 100% Headshot Accuracy across ALL Distances.
 * Status: Complete File. Do not truncate.
 */

// ==========================================
// 1. UTILS: TOÁN HỌC KHÔNG GIAN ĐỘNG (ADAPTIVE MATH)
// ==========================================
class AdaptiveMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    /**
     * NÂNG CẤP: Đường cong bù Y phi tuyến tính (Non-linear Curve)
     * Giải quyết triệt để lỗi Overshoot (Bay qua đầu) ở tầm xa
     */
    static calculateAdaptiveYOffset(distance) {
        // Tầm siêu gần (< 10m): Khóa ngay đỉnh trán (Golden Ratio v46)
        if (distance <= 10.0) return 0.68; 
        
        // Tầm trung (10m - 40m): Nội suy mượt mà
        if (distance <= 40.0) {
            const scale = (distance - 10.0) / 30.0; // 0.0 -> 1.0
            return 0.68 - (0.28 * scale); // Hạ dần từ 0.68 xuống 0.40
        }
        
        // Tầm xa (> 40m): Khóa cứng vào Cằm/Cổ. 
        // Đạn bay xa sẽ có độ rơi (Drop) hoặc rung vi mô. Khóa thấp để đạn găm lên não.
        if (distance <= 80.0) return 0.35;
        
        // Tầm siêu xa (Sniper Range > 80m): Ép sát trọng tâm gốc
        return 0.15; 
    }

    static calculateIntercept(pos, vel, selfVel, dist, pingMs) {
        const timeToHit = (dist / 9999.0) + ((pingMs || 20) / 1000);
        return {
            x: pos.x + ((vel.x - selfVel.x) * timeToHit),
            y: pos.y + ((vel.y - selfVel.y) * timeToHit),
            z: pos.z + ((vel.z - selfVel.z) * timeToHit)
        };
    }
}

// ==========================================
// 2. CORE: ĐỘNG CƠ TỪ TÍNH KHÔNG GIAN ĐỘNG
// ==========================================
class MagnetismHijackerV47 {
    constructor() {
        this.voidWeight = -99999.0; 
        this.maxWeight = 99999.0; 
    }

    enforceZeroRecoil(weapon) {
        if (!weapon) return;
        weapon.recoil = 0.0;
        weapon.spread = 0.0;
        weapon.camera_shake = 0.0;
        weapon.progressive_spread = 0.0;
        weapon.recoil_accumulation = 0.0;
        weapon.recoil_multiplier = 0.0;
        weapon.horizontal_recoil = 0.0;
        weapon.bloom = 0.0;
    }

    /**
     * NÂNG CẤP: Thay đổi thể tích Hitbox theo cự ly (Volumetric Resizing)
     * Giải quyết lỗi dính ngực ở tầm gần
     */
    spoofBoneIDsAdaptive(hitboxes, distance) {
        if (!hitboxes) return;

        // Tính toán hệ số nở của Đầu dựa trên khoảng cách
        // Gần (< 10m): Đầu to x12. Xa (> 50m): Đầu to x3 (Tránh hút nhầm sau vật cản)
        let headMultiplier = 5.0;
        if (distance < 15.0) headMultiplier = 12.0; 
        else if (distance > 50.0) headMultiplier = 3.0;

        // Tính toán độ teo tóp của Ngực
        // Càng gần, ngực càng phải teo nhỏ để chống kẹt tia Raycast
        let torsoRadius = distance < 15.0 ? 0.0001 : 0.01;

        const torso = ['spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips', 'left_arm', 'right_arm'];
        for (let i = 0; i < torso.length; i++) {
            const bone = torso[i];
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight; 
                hitboxes[bone].priority = "IGNORE"; 
                hitboxes[bone].m_Radius = torsoRadius; // Bóp nghẹt diện tích ngực
                hitboxes[bone].friction = 0.0; 
            }
        }

        if (hitboxes.head) {
            hitboxes.head.snap_weight = this.maxWeight; 
            hitboxes.head.priority = "MAXIMUM"; 
            hitboxes.head.m_Radius *= headMultiplier; // Bơm to đầu theo khoảng cách
        }
    }

    injectAdaptiveOffset(player, selfVel, ping) {
        if (!player || !player.head_pos || !player.chest_pos) return;

        const dist = player.distance || 10.0; 
        const targetVel = player.velocity || { x: 0, y: 0, z: 0 };
        
        // Sử dụng thuật toán Y động lực học mới
        const deltaY = AdaptiveMath.calculateAdaptiveYOffset(dist); 

        const interceptPos = AdaptiveMath.calculateIntercept(player.head_pos, targetVel, selfVel, dist, ping);

        if (player.center_of_mass) {
            player.center_of_mass.x = interceptPos.x;
            player.center_of_mass.z = interceptPos.z;
            
            player.center_of_mass.y = player.chest_pos.y + deltaY; 
            
            // Siết chặt Clamping ở tầm xa để chống đạn bay quá đầu
            let safetyOffset = dist > 40.0 ? 0.05 : 0.15;
            const absoluteHeadTop = player.head_pos.y + safetyOffset; 
            player.center_of_mass.y = AdaptiveMath.clamp(player.center_of_mass.y, player.chest_pos.y, absoluteHeadTop); 
        }
    }

    processPacketData(data) {
        if (!data || typeof data !== 'object') return data;

        if (data.weapon) this.enforceZeroRecoil(data.weapon);

        if (Array.isArray(data.players)) {
            const selfVel = data.player_velocity || { x: 0, y: 0, z: 0 };
            const pingMs = data.ping || 20;

            for (let i = 0; i < data.players.length; i++) {
                const enemy = data.players[i];
                const dist = enemy.distance || 15.0; // Lấy khoảng cách để truyền vào hàm

                // Áp dụng thao túng thể tích động
                this.spoofBoneIDsAdaptive(enemy.hitboxes, dist); 
                this.injectAdaptiveOffset(enemy, selfVel, pingMs); 
            }

            if (data.players.length > 0 && data.camera_state) {
                data.camera_state.stickiness = 1.0; 
                data.camera_state.interpolation = "ZERO";
                data.camera_state.lock_bone = "bone_Head";
            }
        }

        return data;
    }
}

// ==========================================
// 3. SHADOWROCKET INTERCEPTOR
// ==========================================
const EngineV47 = new MagnetismHijackerV47();

function processGamePayload(bodyString) {
    try {
        const payload = JSON.parse(bodyString);
        const mutatedPayload = EngineV47.processPacketData(payload);
        return JSON.stringify(mutatedPayload);
    } catch (error) {
        return bodyString;  
    }
}

if (typeof $response !== "undefined" && $response.body) {
    $done({ body: processGamePayload($response.body) });
}
