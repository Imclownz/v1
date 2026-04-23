/**
 * ENTERPRISE-GRADE: TARGETING & LOCK-HEAD SYSTEM v44.0
 * Architecture: Precision Kinetic Engine (Pure JSON Object Mutation)
 * Core Base: vip 2.js (The Proven Stable Core)
 * Status: Maximum Stability. Perfect SMG/AR Accuracy. Dynamic Intercept.
 */

// ==========================================
// 1. UTILS: TOÁN HỌC KHÔNG GIAN (ĐỘ CHÍNH XÁC CAO)
// ==========================================
class AdvancedMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value)); //
    }

    // Tọa độ chuẩn xác của vùng trán (Golden Ratio)
    static getGoldenYOffset(distance) {
        const BASE_OFFSET = 0.68; 
        const MAX_DISTANCE = 150.0;
        
        if (distance <= 0) return BASE_OFFSET;
        if (distance >= MAX_DISTANCE) return BASE_OFFSET * 0.3; //
        
        const scaleFactor = 1 - (distance / MAX_DISTANCE);
        return BASE_OFFSET * (0.3 + (0.7 * scaleFactor)); //
    }

    // Thuật toán đón lõng mục tiêu (Chống trượt khi địch chạy/nhảy)
    static predictIntercept(targetPos, targetVel, selfVel, distance, pingMs) {
        const BULLET_SPEED = 9999.0;
        // Tính toán độ trễ thời gian (Ping + Thời gian đạn bay)
        const timeOffset = (distance / BULLET_SPEED) + ((pingMs || 20) / 1000); 
        
        return {
            x: targetPos.x + ((targetVel.x - selfVel.x) * timeOffset),
            y: targetPos.y + ((targetVel.y - selfVel.y) * timeOffset),
            z: targetPos.z + ((targetVel.z - selfVel.z) * timeOffset)
        };
    }
}

// ==========================================
// 2. CORE ENGINE: THAO TÚNG THỰC THỂ (PURE JSON)
// ==========================================
class PrecisionEngine {
    constructor() {
        // Sử dụng các con số đã được chứng minh là an toàn và hiệu quả từ vip 2.js
        this.voidWeight = -99999.0; //
        this.maxWeight = 99999.0; //
    }

    /**
     * MODULE 1: ĐÓNG BĂNG VŨ KHÍ (GIẢI QUYẾT LỖI SMG/AR)
     * Can thiệp an toàn vào Object súng mà không dùng RegEx
     */
    enforceAbsoluteZero(weaponObj) {
        if (!weaponObj) return;

        // Xóa độ giật cơ bản
        if ('recoil' in weaponObj) weaponObj.recoil = 0.0;
        if ('spread' in weaponObj) weaponObj.spread = 0.0;
        if ('camera_shake' in weaponObj) weaponObj.camera_shake = 0.0;
        
        // Khóa chặt hiện tượng "Nở tâm" khi sấy SMG/AR liên tục
        if ('progressive_spread' in weaponObj) weaponObj.progressive_spread = 0.0;
        if ('recoil_accumulation' in weaponObj) weaponObj.recoil_accumulation = 0.0;
        if ('recoil_multiplier' in weaponObj) weaponObj.recoil_multiplier = 0.0;
        if ('bloom' in weaponObj) weaponObj.bloom = 0.0;
        if ('horizontal_recoil' in weaponObj) weaponObj.horizontal_recoil = 0.0;
        if ('vertical_recoil' in weaponObj) weaponObj.vertical_recoil = 0.0;

        // Triệt tiêu phạt di chuyển (Giúp aim chuẩn khi vừa chạy vừa bắn)
        if ('movement_penalty' in weaponObj) weaponObj.movement_penalty = 0.0;
        if ('jump_penalty' in weaponObj) weaponObj.jump_penalty = 0.0;
        if ('strafe_penalty' in weaponObj) weaponObj.strafe_penalty = 0.0;
    }

    /**
     * MODULE 2: THAO TÚNG TỪ TÍNH (BONE SPOOFING)
     * Kế thừa logic hoàn hảo từ vip 2.js
     */
    spoofBoneIDs(hitboxes) { //
        if (!hitboxes) return;

        // Xóa sổ trọng số và lực cản của vùng thân dưới
        const torsoBones = ['spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips', 'left_arm', 'right_arm'];
        for (let i = 0; i < torsoBones.length; i++) {
            const bone = torsoBones[i];
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight; //
                hitboxes[bone].priority = "IGNORE"; //
                hitboxes[bone].m_Radius = 0.001; // Thu nhỏ diện tích đón đạn
                hitboxes[bone].friction = 0.0; // Vuốt qua thân không bị cản
            }
        }

        // Dồn toàn bộ từ tính vào vùng Đầu
        if (hitboxes.head) {
            hitboxes.head.snap_weight = this.maxWeight; //
            hitboxes.head.priority = "MAXIMUM"; //
            hitboxes.head.m_Radius *= 8.0; // Phóng to để hệ thống tự vớt tâm
            if ('vertical_magnetism_multiplier' in hitboxes.head) {
                hitboxes.head.vertical_magnetism_multiplier = 5.0; // Hỗ trợ lực Drag thẳng đứng
            }
        }
    }

    /**
     * MODULE 3: DỊCH CHUYỂN TRỌNG TÂM (TELEPORT & CLAMPING)
     */
    teleportAim(player, selfVel, ping) {
        if (!player || !player.head_pos || !player.chest_pos) return; //

        const distance = player.distance || 15.0;
        const targetVel = player.velocity || { x: 0, y: 0, z: 0 };
        
        // Tính toán điểm đón đầu dựa trên tốc độ di chuyển
        const predictedPos = AdvancedMath.predictIntercept(player.head_pos, targetVel, selfVel, distance, ping);
        const deltaY = AdvancedMath.getGoldenYOffset(distance);

        if (player.center_of_mass) { //
            // Dịch chuyển trục X, Z để bám theo địch đang chạy
            player.center_of_mass.x = predictedPos.x;
            player.center_of_mass.z = predictedPos.z;
            
            // Bẻ trục Y lên chuẩn trán
            player.center_of_mass.y = player.chest_pos.y + deltaY; //
            
            // KHÓA TRỤC Y: Đảm bảo tâm không bao giờ vượt quá đỉnh đầu
            const absoluteMaxY = player.head_pos.y + 0.12;
            player.center_of_mass.y = AdvancedMath.clamp(player.center_of_mass.y, player.chest_pos.y, absoluteMaxY); //
        }
    }

    /**
     * HÀM XỬ LÝ CHÍNH
     */
    processPayload(data) {
        if (!data || typeof data !== 'object') return data;

        // 1. Khóa thông số vũ khí (Nếu gói tin chứa dữ liệu súng)
        if (data.weapon) {
            this.enforceAbsoluteZero(data.weapon);
        }

        // 2. Thao túng thực thể (Nếu gói tin chứa mảng người chơi)
        if (Array.isArray(data.players)) { //
            const selfVel = data.player_velocity || { x: 0, y: 0, z: 0 };
            const pingMs = data.ping || 20;

            for (let i = 0; i < data.players.length; i++) { //
                const enemy = data.players[i]; //
                
                // Dọn đường Drag và buff vùng Đầu
                this.spoofBoneIDs(enemy.hitboxes); //
                
                // Tiêm tọa độ khóa tâm chuẩn xác
                this.teleportAim(enemy, selfVel, pingMs);
            }
            
            // 3. Khóa cứng Camera khi đã bắt được mục tiêu
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
// 3. SHADOWROCKET INTERCEPTOR (SAFE EXECUTION)
// ==========================================
const EngineV44 = new PrecisionEngine();

function interceptAndProcess(bodyString) {
    try {
        // Chỉ làm việc với Object JSON hợp lệ. Đảm bảo không bao giờ Crash.
        const payload = JSON.parse(bodyString); //
        const processedPayload = EngineV44.processPayload(payload);
        return JSON.stringify(processedPayload); //
    } catch (error) {
        // Fallback: Trả về gói tin gốc nếu không thể Parse
        return bodyString; //
    }
}

if (typeof $response !== "undefined" && $response.body) { //
    $done({ body: interceptAndProcess($response.body) }); //
}
