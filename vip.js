/**
 * ENTERPRISE-GRADE: TARGETING & LOCK-HEAD SYSTEM v40.0
 * Architecture: Quantum Snap (Teleportation & Continuous Hold)
 * Core Base: vip 2.js Inherited & Supercharged
 * Status: Max Performance. Safety: Bypassed.
 */

// ==========================================
// 1. UTILS: TOÁN HỌC KHÔNG GIAN
// ==========================================
class AdvancedMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value)); // Kế thừa từ vip 2.js
    }

    /**
     * Tính toán Delta Y dựa trên khoảng cách.
     * Tinh chỉnh gắt hơn để đảm bảo dịch chuyển chính xác vào "Golden Ratio".
     */
    static calculateDynamicYOffset(distance) {
        const BASE_OFFSET = 0.68; // Đẩy lên 0.68 (Trán) thay vì 0.65
        const MAX_DISTANCE = 150.0; // Mở rộng tầm quét
        
        if (distance <= 0) return BASE_OFFSET;
        if (distance >= MAX_DISTANCE) return BASE_OFFSET * 0.25; 
        
        const scaleFactor = 1 - (distance / MAX_DISTANCE);
        return BASE_OFFSET * (0.25 + (0.75 * scaleFactor));
    }
}

// ==========================================
// 2. CORE: QUANTUM SNAP ENGINE
// ==========================================
class QuantumSnapEngine {
    constructor() {
        // Đẩy thông số lên mức cực đoan (Extreme Values)
        this.voidWeight = -999999.0; // Xóa sổ hoàn toàn lực hút
        this.quantumWeight = 999999.0; // Lực hút hố đen (Teleport)
    }

    /**
     * KHÓA SÚNG XUYÊN SUỐT: Đảm bảo đường đạn không bị văng khi giữ nút bắn
     */
    enforceContinuousHold(weapon) {
        if (!weapon) return;
        weapon.recoil = 0.0;
        weapon.spread = 0.0;
        weapon.camera_shake = 0.0;
        // Triệt tiêu cơ chế nảy đạn của tiểu liên/AR
        weapon.progressive_spread = 0.0; 
        weapon.recoil_accumulation = 0.0;
        weapon.recoil_multiplier = 0.0;
        weapon.horizontal_recoil = 0.0;
        weapon.bloom = 0.0;
    }

    /**
     * TẠO ĐIỂM KỲ DỊ TỪ TÍNH (Magnetic Singularity)
     * Kế thừa và nâng cấp logic spoofBoneIDs từ vip 2.js
     */
    annihilateBodyAndMagnetizeHead(hitboxes) {
        if (!hitboxes) return;

        // 1. Xóa sổ hoàn toàn sự tồn tại của thân dưới trong mắt Aim Assist
        const torsoBones = ['spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips', 'left_arm', 'right_arm', 'left_leg', 'right_leg'];
        for (let i = 0; i < torsoBones.length; i++) {
            const bone = torsoBones[i];
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight; // Kế thừa logic voidWeight
                hitboxes[bone].priority = "IGNORE";
                hitboxes[bone].m_Radius = 0.001; // Thu nhỏ gần bằng 0
                hitboxes[bone].friction = 0.0; // Triệt tiêu lực cản
            }
        }

        // 2. Cường hóa đầu thành hố đen từ tính
        if (hitboxes.head) {
            hitboxes.head.snap_weight = this.quantumWeight;
            hitboxes.head.priority = "MAXIMUM";
            // Mở rộng bán kính cực đại để Crosshair bắt sóng ngay khi nhấp nhả nút bắn
            hitboxes.head.m_Radius *= 8.0; 
        }
    }

    /**
     * CƠ CHẾ DỊCH CHUYỂN (TELEPORT VECTORS)
     * Thay vì cộng dồn, ghi đè trực tiếp tọa độ Center of Mass vào trán.
     */
    teleportCenterOfMass(player) {
        if (!player || !player.head_pos || !player.chest_pos) return;

        const distance = player.distance || 10.0;
        const deltaY = AdvancedMath.calculateDynamicYOffset(distance);

        if (player.center_of_mass) {
            // Dịch chuyển tuyệt đối: Ép Center of Mass trùng khớp với tọa độ X, Z của Đầu
            player.center_of_mass.x = player.head_pos.x;
            player.center_of_mass.z = player.head_pos.z;
            
            // Ép trục Y lên thẳng trán
            player.center_of_mass.y = player.chest_pos.y + deltaY;
            
            // CHỐNG VƯỢT ĐẦU: Kế thừa logic Clamping chuẩn xác từ vip 2.js
            const absoluteHeadTop = player.head_pos.y + 0.12; // Siết chặt giới hạn đỉnh đầu hơn nữa
            player.center_of_mass.y = AdvancedMath.clamp(player.center_of_mass.y, player.chest_pos.y, absoluteHeadTop); //
        }
    }

    processPacketData(data) {
        if (!data) return data;

        // 1. Kích hoạt khóa súng cho SMG/AR
        if (data.weapon) this.enforceContinuousHold(data.weapon);

        if (!Array.isArray(data.players)) return data;

        for (let i = 0; i < data.players.length; i++) {
            const enemy = data.players[i];
            
            // 2. Tạo điểm kỳ dị từ tính
            this.annihilateBodyAndMagnetizeHead(enemy.hitboxes);
            
            // 3. Thực thi Dịch chuyển (Teleport) tọa độ ngắm
            this.teleportCenterOfMass(enemy);
        }

        return data;
    }
}

// ==========================================
// 3. SHADOWROCKET INTERCEPTOR (ENTRY POINT)
// ==========================================
const EngineInstance = new QuantumSnapEngine();

function processGamePayload(bodyString) {
    try {
        const payload = JSON.parse(bodyString); //
        const mutatedPayload = EngineInstance.processPacketData(payload); //
        return JSON.stringify(mutatedPayload); //
    } catch (error) {
        return bodyString; //
    }
}

if (typeof $response !== "undefined" && $response.body) {
    $done({ body: processGamePayload($response.body) }); //
}
