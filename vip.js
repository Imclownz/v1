/**
 * ENTERPRISE-GRADE: TARGETING & LOCK-HEAD SYSTEM v47.0
 * Architecture: True Legacy 'vip 2.js' + Adaptive Distance Engine
 * Status: No Overshooting at Long Range. Zero Chest Friction at Close Range.
 */

// ==========================================
// 1. UTILS: TOÁN HỌC THÍCH ỨNG (ADAPTIVE MATH)
// ==========================================
class AdvancedMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value)); //
    }

    /**
     * THUẬT TOÁN KHOẢNG CÁCH THÍCH ỨNG (Giải quyết lỗi Vượt Đầu & Lệch Tâm)
     * Chia làm 3 phân đoạn rõ rệt thay vì tuyến tính.
     */
    static calculateAdaptiveYOffset(distance) {
        // Tầm Cận Chiến (0-15m): Khóa thẳng Trán/Đỉnh đầu để đạn ghim ngay lập tức
        if (distance <= 15.0) return 0.68; 
        
        // Tầm Trung (15-50m): Khóa Mũi/Mắt
        if (distance > 15.0 && distance <= 50.0) {
            const scale = 1 - ((distance - 15) / 35);
            return 0.50 + (0.18 * scale); 
        }
        
        // Tầm Xa (>50m): Khóa Yết Hầu/Cổ. Giải quyết triệt để lỗi đạn bay qua đầu.
        return 0.35; 
    }

    // Đón đầu hướng di chuyển
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
// 2. CORE: ĐỘNG CƠ TỪ TÍNH KHÔNG GIAN
// ==========================================
class MagnetismHijacker {
    constructor() {
        this.voidWeight = -99999.0; //
        this.maxWeight = 99999.0; //
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
     * QUẢN LÝ THỂ TÍCH (Giải quyết lỗi kẹt ngực tầm gần)
     */
    spoofBoneIDs(hitboxes, distance) { 
        if (!hitboxes) return;

        // Triệt tiêu thân dưới và XÓA SỔ THỂ TÍCH
        const torso = ['spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips'];
        for (let i = 0; i < torso.length; i++) { //
            const bone = torso[i];
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight; //
                hitboxes[bone].priority = "IGNORE"; //
                
                // Thu nhỏ thể tích ngực xuống mức "hạt bụi". Tia ngắm sẽ đâm xuyên qua.
                hitboxes[bone].m_Radius = 0.001; 
                hitboxes[bone].friction = 0.0; 
            }
        }

        // Cường hóa Đầu (Magnetic Hitbox) ở mức VỪA ĐỦ ôm sát viền sọ, không mở rộng quá lố
        if (hitboxes.head) {
            hitboxes.head.snap_weight = this.maxWeight; //
            hitboxes.head.priority = "MAXIMUM"; //
            
            // Nếu ở gần, phóng to nhẹ để dễ vẩy. Nếu ở xa, giữ nguyên để không bị lệch sát thương.
            hitboxes.head.m_Radius *= (distance < 20) ? 5.0 : 2.5; 
            
            // Bơm lực vẩy (Drag Force) cho trục dọc
            if ('vertical_magnetism_multiplier' in hitboxes.head) {
                hitboxes.head.vertical_magnetism_multiplier = 4.0;
            }
        }
    }

    injectAdaptiveOffset(player, selfVel, ping) { 
        if (!player || !player.head_pos || !player.chest_pos) return; //

        const dist = player.distance || 15.0; //
        const targetVel = player.velocity || { x: 0, y: 0, z: 0 };
        
        // Gọi thuật toán tính Delta Y Thích ứng Khoảng cách
        const deltaY = AdvancedMath.calculateAdaptiveYOffset(dist); 

        const interceptPos = AdvancedMath.calculateIntercept(player.head_pos, targetVel, selfVel, dist, ping);

        if (player.center_of_mass) { //
            player.center_of_mass.x = interceptPos.x;
            player.center_of_mass.z = interceptPos.z;
            
            // Ghi đè trọng tâm nội suy
            player.center_of_mass.y = player.chest_pos.y + deltaY; //
            
            // Giới hạn tuyệt đối bảo vệ
            const absoluteHeadTop = player.head_pos.y + 0.12; 
            player.center_of_mass.y = AdvancedMath.clamp(player.center_of_mass.y, player.chest_pos.y, absoluteHeadTop); //
        }
    }

    processPacketData(data) { //
        if (!data || typeof data !== 'object') return data;

        if (data.weapon) this.enforceZeroRecoil(data.weapon);

        if (Array.isArray(data.players)) { //
            const selfVel = data.player_velocity || { x: 0, y: 0, z: 0 };
            const pingMs = data.ping || 20;

            for (let i = 0; i < data.players.length; i++) { //
                const enemy = data.players[i]; //
                const dist = enemy.distance || 15.0;
                
                // Truyền tham số Khoảng cách vào để tự điều chỉnh Thể tích Hitbox
                this.spoofBoneIDs(enemy.hitboxes, dist); 
                this.injectAdaptiveOffset(enemy, selfVel, pingMs); 
            }

            // Ép cứng độ dính Camera
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
const hijacker = new MagnetismHijacker(); //

function processGamePayload(bodyString) { //
    try {
        const payload = JSON.parse(bodyString); //
        const mutatedPayload = hijacker.processPacketData(payload); //
        return JSON.stringify(mutatedPayload); //
    } catch (error) { //
        return bodyString;  //
    }
}

if (typeof $response !== "undefined" && $response.body) { //
    $done({ body: processGamePayload($response.body) }); //
}
