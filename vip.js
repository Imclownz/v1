/**
 * ENTERPRISE-GRADE: TARGETING & LOCK-HEAD SYSTEM v38.5
 * Architecture: Magnetism Hijacker + Kinetic Prediction (Standalone)
 * Optimization: SMG/AR Anti-Bloom & Perfect Hit-Registration
 */

// ==========================================
// 1. UTILS: TOÁN HỌC CỰC HẠN
// ==========================================
class AdvancedMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    /**
     * Thuật toán chặn đầu (Intercept) dành cho SMG/AR
     * Tính toán điểm rơi dựa trên vận tốc và độ trễ thực tế
     */
    static calculateIntercept(pos, vel, selfVel, dist, bulletSpeed, ping) {
        const timeToHit = (dist / bulletSpeed) + (ping / 1000);
        return {
            x: pos.x + ((vel.x - selfVel.x) * timeToHit),
            y: pos.y + ((vel.y - selfVel.y) * timeToHit),
            z: pos.z + ((vel.z - selfVel.z) * timeToHit)
        };
    }

    static calculateDynamicYOffset(distance) {
        const BASE_OFFSET = 0.66; // Golden Ratio v38.5
        const MAX_DISTANCE = 120.0;
        if (distance <= 0) return BASE_OFFSET;
        const scaleFactor = 1 - (distance / MAX_DISTANCE);
        return AdvancedMath.clamp(BASE_OFFSET * (0.4 + (0.6 * scaleFactor)), 0.2, 0.8);
    }
}

// ==========================================
// 2. CORE: THE MAGNETISM HIJACKER v38.5
// ==========================================
class MagnetismHijacker {
    constructor() {
        this.voidWeight = -99999.0;
        this.maxWeight = 99999.0;
        this.bulletSpeed = 9999.0; // Hit-scan logic
    }

    /**
     * KHẮC PHỤC LỆCH ĐẠN SMG: Triệt tiêu mọi biến số động của súng
     */
    enforceWeaponStability(weapon) {
        if (!weapon) return;
        // Triệt tiêu cơ bản
        weapon.recoil = 0.0;
        weapon.spread = 0.0;
        weapon.camera_shake = 0.0;
        // SMG/AR FIX: Chặn nở tâm và cộng dồn giật
        weapon.progressive_spread = 0.0; 
        weapon.recoil_accumulation = 0.0;
        weapon.recoil_multiplier = 0.0;
        weapon.horizontal_recoil = 0.0;
        weapon.vertical_recoil = 0.0;
        weapon.bloom = 0.0; 
        weapon.max_spread = 0.0;
    }

    /**
     * BẢO LƯU LOGIC GỐC: Phá hủy trọng số thân, dồn lực vào đầu
     */
    spoofBoneIDs(hitboxes) {
        if (!hitboxes) return;
        const torsoBones = ['spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips'];
        for (let bone of torsoBones) {
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight;
                hitboxes[bone].priority = "IGNORE";
                hitboxes[bone].m_Radius = 0.01;
            }
        }
        if (hitboxes.head) {
            hitboxes.head.snap_weight = this.maxWeight;
            hitboxes.head.priority = "MAXIMUM";
            hitboxes.head.m_Radius *= 5.0; // Phóng đại x5
        }
    }

    /**
     * TIÊM TỌA ĐỘ DỰ ĐOÁN (Kinetic Injection)
     */
    injectKineticOffset(player, selfVel, ping) {
        if (!player || !player.head_pos || !player.chest_pos) return;

        const dist = player.distance || 10.0;
        const tVel = player.velocity || { x: 0, y: 0, z: 0 };
        
        // Dự đoán vị trí đầu ở tương lai dựa trên vận tốc
        const predictedHead = AdvancedMath.calculateIntercept(
            player.head_pos, tVel, selfVel, dist, this.bulletSpeed, ping
        );

        const deltaY = AdvancedMath.calculateDynamicYOffset(dist);
        const headHeight = player.hitboxes?.head?.m_Height || 0.2;

        if (player.center_of_mass) {
            // Tiêm tọa độ dự đoán vào trọng tâm nội suy
            player.center_of_mass.x = predictedHead.x;
            player.center_of_mass.z = predictedHead.z;
            player.center_of_mass.y = player.chest_pos.y + deltaY;
            
            // Giới hạn trục Y chuẩn v38.5
            const absoluteMaxY = player.head_pos.y + (headHeight * 0.85);
            player.center_of_mass.y = AdvancedMath.clamp(player.center_of_mass.y, player.chest_pos.y, absoluteMaxY);
        }
    }

    processPacketData(data) {
        if (!data) return data;
        
        // 1. Ổn định súng (Fix SMG/AR)
        if (data.weapon) this.enforceWeaponStability(data.weapon);

        if (!Array.isArray(data.players)) return data;

        const selfVel = data.player_velocity || { x: 0, y: 0, z: 0 };
        const currentPing = data.ping || 15;

        for (let enemy of data.players) {
            // 2. Thực thi luật từ tính (Logic gốc từ vip 2.js)
            this.spoofBoneIDs(enemy.hitboxes);
            
            // 3. Tiêm tọa độ dự đoán chuyển động
            this.injectKineticOffset(enemy, selfVel, currentPing);
        }

        // 4. Khóa cứng Camera (Stickiness Maxima)
        if (data.players.length > 0) {
            data.camera_state = {
                stickiness: 1.0,
                interpolation: "ZERO",
                lock_bone: "bone_Head"
            };
        }

        return data;
    }
}

// ==========================================
// 3. ENTRY POINT (SHADOWROCKET)
// ==========================================
const hijacker = new MagnetismHijacker();

function processGamePayload(bodyString) {
    try {
        const payload = JSON.parse(bodyString);
        const mutatedPayload = hijacker.processPacketData(payload);
        return JSON.stringify(mutatedPayload);
    } catch (error) {
        return bodyString; 
    }
}

if (typeof $response !== "undefined" && $response.body) {
    $done({ body: processGamePayload($response.body) });
}
