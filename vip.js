/**
 * ENTERPRISE-GRADE: TARGETING & LOCK-HEAD SYSTEM - NETWORK INJECTOR
 * Deployment: Shadowrocket / Proxy Packet Interception
 * Core Logic: Bone ID Spoofing & Dynamic Y-Offset Magnetism
 */

// ==========================================
// 1. UTILS: TOÁN HỌC KHÔNG GIAN
// ==========================================
class AdvancedMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    /**
     * Tính toán Delta Y (Khoảng cách bù trừ từ Ngực lên Đầu) dựa trên cự ly.
     * Càng gần kẻ địch, mô hình càng lớn -> Delta Y phải lớn hơn.
     */
    static calculateDynamicYOffset(distance) {
        const BASE_OFFSET = 0.65; // Đơn vị đo lường engine (m)
        const MAX_DISTANCE = 100.0;
        
        if (distance <= 0) return BASE_OFFSET;
        if (distance >= MAX_DISTANCE) return BASE_OFFSET * 0.3; // Xa thì bù trừ ít lại
        
        // Tuyến tính suy giảm theo khoảng cách
        const scaleFactor = 1 - (distance / MAX_DISTANCE);
        return BASE_OFFSET * (0.3 + (0.7 * scaleFactor));
    }
}

// ==========================================
// 2. CORE MUTATOR: BỘ THAO TÚNG DỮ LIỆU
// ==========================================
class MagnetismHijacker {
    constructor() {
        this.voidWeight = -99999.0;
        this.maxWeight = 99999.0;
        this.targetBone = "bone_Head";
    }

    /**
     * Sửa đổi trực tiếp mảng Hitbox trong gói tin để đánh lừa thuật toán Raycast của game.
     * Game sẽ tưởng vùng Đầu có trọng lượng từ tính lớn nhất.
     */
    spoofBoneIDs(hitboxes) {
        if (!hitboxes) return;

        // 1. Phá bỏ lực hút thân (Anti-Chest Lock)
        const torsoBones = ['spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips'];
        torsoBones.forEach(bone => {
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight;
                hitboxes[bone].priority = "IGNORE";
                hitboxes[bone].m_Radius = 0.01; // Thu nhỏ hitbox thân về gần mức 0
            }
        });

        // 2. Khuếch đại lực hút Đầu
        if (hitboxes.head) {
            hitboxes.head.snap_weight = this.maxWeight;
            hitboxes.head.priority = "MAXIMUM";
            // Tăng bán kính nhận diện để Raycast dễ chạm hơn, nhưng không làm to mô hình
            hitboxes.head.m_Radius *= 4.5; 
        }
    }

    /**
     * Ghi đè tọa độ của Center of Mass (Trọng tâm) để hút tâm lên trán.
     */
    injectYOffset(player) {
        if (!player || !player.head_pos || !player.chest_pos) return;

        const distance = player.distance || 10.0; // Mặc định 10m nếu không có dữ liệu
        const deltaY = AdvancedMath.calculateDynamicYOffset(distance);

        // Ghi đè trọng tâm (Center of Mass) mà game dùng để tính Aim Assist
        // Thay vì hút vào chest_pos, ép nó hút vào chest_pos + deltaY (vùng đầu/trán)
        if (player.center_of_mass) {
            player.center_of_mass.y = player.chest_pos.y + deltaY;
            
            // Đảm bảo không vẩy vượt quá đỉnh đầu (Y-Axis Clamping)
            const absoluteHeadTop = player.head_pos.y + 0.15; // +0.15 là đỉnh mô hình
            player.center_of_mass.y = AdvancedMath.clamp(player.center_of_mass.y, player.chest_pos.y, absoluteHeadTop);
        }
    }

    processPacketData(data) {
        if (!data || !Array.isArray(data.players)) return data;

        // Quét qua toàn bộ danh sách kẻ địch trong vùng Render
        for (let i = 0; i < data.players.length; i++) {
            const enemy = data.players[i];
            
            // 1. Đánh lừa ID xương để game tự dồn lực vào đầu
            this.spoofBoneIDs(enemy.hitboxes);
            
            // 2. Tiêm tọa độ bù trừ ảo để khóa chặt vào vị trí trán
            this.injectYOffset(enemy);
        }

        return data;
    }
}

// ==========================================
// 3. SHADOWROCKET INTERCEPTOR (ENTRY POINT)
// ==========================================
const hijacker = new MagnetismHijacker();

function processGamePayload(bodyString) {
    try {
        // Parse gói tin JSON từ Server gửi về Client
        const payload = JSON.parse(bodyString);
        
        // Thực thi Hijack logic
        const mutatedPayload = hijacker.processPacketData(payload);
        
        // Đóng gói lại và gửi cho Client
        return JSON.stringify(mutatedPayload);
    } catch (error) {
        // Fallback: Trả về gói tin gốc nếu lỗi để tránh Crash game
        return bodyString; 
    }
}

// Giao thức thực thi của Shadowrocket ($done)
if (typeof $response !== "undefined" && $response.body) {
    $done({ body: processGamePayload($response.body) });
}
