/**
 * ENTERPRISE-GRADE: TARGETING & LOCK-HEAD SYSTEM v41.0
 * Architecture: Apex Kinetic Lock (High-Speed Combat Optimized)
 * Status: Maximum Drag & Lock. Dynamic Intercept Active.
 */

// ==========================================
// 1. UTILS: TOÁN HỌC DỰ ĐOÁN (KINETIC MATH)
// ==========================================
class KineticMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value)); // Kế thừa logic kẹp trục Y
    }

    /**
     * Bù Y động: Ép tâm vào giữa trán (Golden Ratio)
     */
    static getGoldenYOffset(distance) {
        const BASE = 0.68;
        if (distance <= 0) return BASE;
        return BASE * (0.3 + (0.7 * (1 - (distance / 150.0))));
    }

    /**
     * Thuật toán Dự đoán Vector Tương đối (Chống Strafe/Jump)
     * Đẩy tọa độ lên trước mặt mục tiêu dựa trên tốc độ và độ trễ
     */
    static predictIntercept(pos, targetVel, selfVel, distance, pingMs) {
        const BULLET_SPEED = 9999.0;
        // Chuyển Ping từ ms sang giây. Cộng thêm 0.05s độ trễ phản xạ server
        const timeOffset = (distance / BULLET_SPEED) + (pingMs / 1000) + 0.05; 
        
        return {
            x: pos.x + ((targetVel.x - selfVel.x) * timeOffset),
            y: pos.y + ((targetVel.y - selfVel.y) * timeOffset), // Đón lõng khi mục tiêu nhảy
            z: pos.z + ((targetVel.z - selfVel.z) * timeOffset)
        };
    }
}

// ==========================================
// 2. CORE: APEX LOCK ENGINE
// ==========================================
class ApexLockEngine {
    constructor() {
        this.hyperVoid = -9999999.0; // Triệt tiêu cực đại
        this.hyperLock = 9999999.0;  // Gắn keo cực đại
    }

    /**
     * MODULE KHÁNG RUNG ĐỘNG (Xóa Phạt Di Chuyển)
     */
    enforceAbsoluteZero(weapon) {
        if (!weapon) return;
        
        // Cơ bản
        weapon.recoil = 0.0;
        weapon.spread = 0.0;
        weapon.camera_shake = 0.0;
        
        // Kháng nở tâm liên thanh
        weapon.progressive_spread = 0.0;
        weapon.recoil_accumulation = 0.0;
        weapon.bloom = 0.0;
        
        // [NEW] KHÁNG GIAO TRANH TỐC ĐỘ CAO: Triệt tiêu phạt di chuyển
        weapon.movement_penalty = 0.0;  // Không giật khi vừa chạy vừa sấy
        weapon.jump_penalty = 0.0;      // Không bung tâm khi nhảy bắn (Jump-shot)
        weapon.strafe_penalty = 0.0;    // Không bung tâm khi lạng lách
    }

    /**
     * MODULE MAX DRAG & LOCK (Thao túng từ tính)
     */
    maximizeMagnetism(hitboxes) {
        if (!hitboxes) return;

        // Xóa sạch lực hút thân dưới và LỰC CẢN (Friction)
        const torso = ['spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips', 'left_arm', 'right_arm'];
        for (let bone of torso) {
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.hyperVoid;
                hitboxes[bone].priority = "IGNORE";
                hitboxes[bone].friction = 0.0; // Vuốt qua thân không có cảm giác bị rít lại
                hitboxes[bone].m_Radius = 0.001; 
            }
        }

        // Tối đa hóa Drag to Head
        if (hitboxes.head) {
            hitboxes.head.snap_weight = this.hyperLock;
            hitboxes.head.priority = "MAXIMUM";
            // Mở rộng lồng đón mục tiêu x10. Chỉ cần vẩy gần đầu là dính.
            hitboxes.head.m_Radius *= 10.0; 
            hitboxes.head.vertical_magnetism_multiplier = 10.0; // Buff riêng lực hút trục dọc (Drag)
        }
    }

    /**
     * MODULE GHI ĐÈ TRỌNG TÂM (TELEPORT & INTERCEPT)
     */
    injectApexLockPoint(player, selfVel, ping) {
        if (!player || !player.head_pos || !player.chest_pos) return;

        const dist = player.distance || 15.0;
        const targetVel = player.velocity || { x: 0, y: 0, z: 0 };
        
        // Tính toán tọa độ dự đoán ở tương lai gần
        const predictedHead = KineticMath.predictIntercept(player.head_pos, targetVel, selfVel, dist, ping);
        const deltaY = KineticMath.getGoldenYOffset(dist);

        // Kế thừa và nâng cấp logic ghi đè center_of_mass
        if (player.center_of_mass) {
            // Dịch chuyển X, Z theo hướng di chuyển của địch
            player.center_of_mass.x = predictedHead.x;
            player.center_of_mass.z = predictedHead.z;
            
            // Dịch chuyển Y lên trán (Golden Ratio)
            player.center_of_mass.y = player.chest_pos.y + deltaY;
            
            // Kẹp chặt Y: Không vượt quá đỉnh đầu dù mục tiêu đang nhảy (Jump-shot)
            const absoluteMaxY = player.head_pos.y + 0.15;
            player.center_of_mass.y = KineticMath.clamp(player.center_of_mass.y, player.chest_pos.y, absoluteMaxY); //
        }
    }

    processPayload(data) {
        if (!data) return data;

        // 1. Ép súng thành Laser tĩnh (kể cả khi chạy/nhảy)
        if (data.weapon) this.enforceAbsoluteZero(data.weapon);

        if (!Array.isArray(data.players)) return data;

        const selfVel = data.player_velocity || { x: 0, y: 0, z: 0 };
        const pingMs = data.ping || 20;

        for (let enemy of data.players) {
            // 2. Max Drag & Lock
            this.maximizeMagnetism(enemy.hitboxes);
            
            // 3. Dự đoán và Teleport
            this.injectApexLockPoint(enemy, selfVel, pingMs);
        }

        // 4. Đóng băng Trạng thái Camera
        if (data.players.length > 0 && data.camera_state) {
            data.camera_state.stickiness = 1.0; 
            data.camera_state.interpolation = "ZERO";
            data.camera_state.aim_acceleration = 0.0; // Tắt gia tốc để aim mượt mà theo tay
        }

        return data;
    }
}

// ==========================================
// 3. EXECUTION POINT
// ==========================================
const Engine = new ApexLockEngine();

if (typeof $response !== "undefined" && $response.body) {
    try {
        const payload = JSON.parse($response.body); //
        const finalData = Engine.processPayload(payload);
        $done({ body: JSON.stringify(finalData) }); //
    } catch (e) {
        $done({ body: $response.body }); //
    }
}
