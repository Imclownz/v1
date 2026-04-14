/**
 * ENTERPRISE-GRADE: TARGETING & LOCK-HEAD SYSTEM v37.1
 * Architecture: Direct Payload Hijacker, Bone Spoofing, Y-Axis Clamping
 * Status: Maximum Performance. Safety Protocols: BYPASSED.
 * Directives: NO ESP, NO Triggerbot. Pure Aim Assist Magnetism.
 */

// ==========================================
// 1. UTILS: TOÁN HỌC KHÔNG GIAN (Tối ưu hóa CPU)
// ==========================================
class AdvancedMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    /**
     * Bù trừ trục Y động dựa trên khoảng cách.
     * Scale chính xác theo tỷ lệ FOV của game.
     */
    static calculateDynamicYOffset(distance) {
        const BASE_OFFSET = 0.65; // Đơn vị đo lường engine Unity
        const MAX_DISTANCE = 100.0;
        
        if (distance <= 0) return BASE_OFFSET;
        if (distance >= MAX_DISTANCE) return BASE_OFFSET * 0.3;
        
        const scaleFactor = 1 - (distance / MAX_DISTANCE);
        return BASE_OFFSET * (0.3 + (0.7 * scaleFactor));
    }
}

// ==========================================
// 2. CORE MUTATOR: BỘ THAO TÚNG TỪ TÍNH
// ==========================================
class MagnetismHijacker {
    constructor() {
        this.voidWeight = -99999.0;
        this.maxWeight = 99999.0;
    }

    /**
     * IRONCLAD LAW: Phá bỏ hoàn toàn lực hút vùng thân, ưu tiên Đầu tuyệt đối.
     */
    spoofBoneIDs(hitboxes) {
        if (!hitboxes) return;

        // Tiêu diệt trọng số của toàn bộ vùng thân dưới
        const torsoBones = ['spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips'];
        for (let i = 0; i < torsoBones.length; i++) {
            const bone = torsoBones[i];
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight;
                hitboxes[bone].priority = "IGNORE";
                hitboxes[bone].m_Radius = 0.01; // Ép diện tích nhận diện về gần 0
            }
        }

        // Cường hóa vùng Đầu
        if (hitboxes.head) {
            hitboxes.head.snap_weight = this.maxWeight;
            hitboxes.head.priority = "MAXIMUM";
            hitboxes.head.m_Radius *= 4.5; // Phóng to vùng đón raycast
        }
    }

    /**
     * Ghi đè trọng tâm nội suy của Unity Engine (Y-Axis Clamping).
     */
    injectYOffset(player) {
        if (!player || !player.head_pos || !player.chest_pos) return;

        const distance = player.distance || 10.0; 
        const deltaY = AdvancedMath.calculateDynamicYOffset(distance);

        // Kéo trọng tâm nội suy từ Ngực lên Trán
        if (player.center_of_mass) {
            player.center_of_mass.y = player.chest_pos.y + deltaY;
            
            // GIỚI HẠN TUYỆT ĐỐI: Không bao giờ vượt quá đỉnh đầu
            const absoluteHeadTop = player.head_pos.y + 0.15;
            player.center_of_mass.y = AdvancedMath.clamp(player.center_of_mass.y, player.chest_pos.y, absoluteHeadTop);
        }
    }

    processPacketData(data) {
        // Chỉ kích hoạt thao túng khi packet thực sự chứa dữ liệu thực thể
        if (!data || !Array.isArray(data.players)) return data;

        // Quét và can thiệp toàn bộ dữ liệu đối thủ trong tầm Render
        for (let i = 0; i < data.players.length; i++) {
            const enemy = data.players[i];
            
            // 1. Đánh lừa ID xương để game dồn lực hút vào đầu
            this.spoofBoneIDs(enemy.hitboxes);
            
            // 2. Tiêm tọa độ ảo chống vẩy tâm vượt đầu
            this.injectYOffset(enemy);
        }

        return data;
    }
}

// ==========================================
// 3. ENTRY POINT (SHADOWROCKET INTEGRATION)
// ==========================================
const hijacker = new MagnetismHijacker();

function processGamePayload(bodyString) {
    try {
        const payload = JSON.parse(bodyString);
        const mutatedPayload = hijacker.processPacketData(payload);
        return JSON.stringify(mutatedPayload);
    } catch (error) {
        // Fallback an toàn tuyệt đối để không gây Crash Client
        return bodyString; 
    }
}

// Bắt gói tin và ghi đè
if (typeof $response !== "undefined" && $response.body) {
    $done({ body: processGamePayload($response.body) });
}
