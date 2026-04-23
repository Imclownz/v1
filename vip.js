/**
 * ENTERPRISE-GRADE: TARGETING & LOCK-HEAD SYSTEM v46.0
 * Architecture: True Legacy 'vip 2.js' + Vector Intercept
 * Status: Absolute Zero Recoil. Maximum Stickiness. 
 */

// ==========================================
// 1. UTILS: TOÁN HỌC GỐC TỪ VIP 2.JS
// ==========================================
class AdvancedMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value)); //
    }

    /**
     * Tỷ lệ vàng nguyên bản từ vip 2.js - Không thay đổi!
     */
    static calculateDynamicYOffset(distance) { //
        const BASE_OFFSET = 0.65; //
        const MAX_DISTANCE = 100.0; //
        
        if (distance <= 0) return BASE_OFFSET; //
        if (distance >= MAX_DISTANCE) return BASE_OFFSET * 0.3; //
        
        const scaleFactor = 1 - (distance / MAX_DISTANCE); //
        return BASE_OFFSET * (0.3 + (0.7 * scaleFactor)); //
    }

    /**
     * CHỈ BỔ SUNG: Tính toán điểm rơi khi địch chạy ngang
     */
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
// 2. CORE: ĐỘNG CƠ TỪ TÍNH TỐI ĐA
// ==========================================
class MagnetismHijacker {
    constructor() {
        // Thông số nguyên bản đã được chứng minh hiệu quả
        this.voidWeight = -99999.0; //
        this.maxWeight = 99999.0; //
    }

    enforceZeroRecoil(weapon) {
        if (!weapon) return;
        // Ép về 0.0 tuyệt đối. Không dùng số thập phân!
        weapon.recoil = 0.0;
        weapon.spread = 0.0;
        weapon.camera_shake = 0.0;
        weapon.progressive_spread = 0.0;
        weapon.recoil_accumulation = 0.0;
        weapon.recoil_multiplier = 0.0;
        weapon.horizontal_recoil = 0.0;
        weapon.bloom = 0.0;
    }

    spoofBoneIDs(hitboxes) { //
        if (!hitboxes) return;

        // Triệt tiêu thân dưới
        const torso = ['spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips'];
        for (let i = 0; i < torso.length; i++) { //
            const bone = torso[i];
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight; //
                hitboxes[bone].priority = "IGNORE"; //
                hitboxes[bone].m_Radius = 0.01; //
                hitboxes[bone].friction = 0.0; // Xóa lực cản vuốt
            }
        }

        // Cường hóa Đầu
        if (hitboxes.head) {
            hitboxes.head.snap_weight = this.maxWeight; //
            hitboxes.head.priority = "MAXIMUM"; //
            hitboxes.head.m_Radius *= 6.0; // Phóng to vừa đủ để bắt tâm nhanh
        }
    }

    injectYOffset(player, selfVel, ping) { //
        if (!player || !player.head_pos || !player.chest_pos) return; //

        const dist = player.distance || 10.0; //
        const targetVel = player.velocity || { x: 0, y: 0, z: 0 };
        const deltaY = AdvancedMath.calculateDynamicYOffset(dist); //

        // Tính toán tọa độ chặn đầu để kéo đạn trúng khi địch chạy
        const interceptPos = AdvancedMath.calculateIntercept(player.head_pos, targetVel, selfVel, dist, ping);

        if (player.center_of_mass) { //
            // Áp dụng tọa độ đón đầu cho X và Z
            player.center_of_mass.x = interceptPos.x;
            player.center_of_mass.z = interceptPos.z;
            
            // Kéo trọng tâm nội suy lên Trán (Giữ nguyên logic vip 2.js)
            player.center_of_mass.y = player.chest_pos.y + deltaY; //
            
            // GIỚI HẠN TUYỆT ĐỐI
            const absoluteHeadTop = player.head_pos.y + 0.15; //
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
                this.spoofBoneIDs(enemy.hitboxes); //
                this.injectYOffset(enemy, selfVel, pingMs); //
            }

            // ÉP CỨNG CAMERA: Khóa cứng độ dính, bắt chết mục tiêu
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
