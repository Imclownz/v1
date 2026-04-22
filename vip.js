/**
 * ENTERPRISE-GRADE: TARGETING SYSTEM v39.0
 * Core Focus: "Slingshot" Drag-to-Head & "Super-Glue" Lock-Head
 * Status: Max Performance. Safety: Bypassed.
 */

// ==========================================
// 1. UTILS: TOÁN HỌC KHÔNG GIAN
// ==========================================
class AdvancedMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    // Tỉ lệ vàng của vùng trán
    static getGoldenRatio() {
        return 0.68; 
    }
}

// ==========================================
// 2. ENGINE 1: DRAG-TO-HEAD (SLINGSHOT)
// ==========================================
class DragAssistEngine {
    constructor() {
        this.voidWeight = -99999.0;
        this.catapultForce = 99999.0;
    }

    /**
     * Triệt tiêu lực cản của thân, tạo đường băng trơn tru để vuốt tâm
     */
    eliminateFriction(hitboxes) {
        if (!hitboxes) return;
        const frictionBones = ['spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips'];
        for (let bone of frictionBones) {
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight; // Đánh sập từ tính ngực
                hitboxes[bone].priority = "IGNORE";
                hitboxes[bone].friction = 0.0; // Triệt tiêu lực cản khi vuốt qua ngực
            }
        }
    }

    /**
     * Tạo lực hút nhân tạo (Slingshot) thẳng đứng lên vùng đầu
     */
    igniteCatapult(hitboxes) {
        if (!hitboxes || !hitboxes.head) return;
        
        hitboxes.head.priority = "MAXIMUM";
        hitboxes.head.snap_weight = this.catapultForce;
        
        // Mở rộng lồng đón raycast hình nón (Cone-expansion) để bắt Drag dễ hơn
        hitboxes.head.m_Radius *= 6.0; 
        
        // Nếu Engine hỗ trợ, buff độ nhạy trục dọc
        if (hitboxes.head.vertical_magnetism_multiplier) {
            hitboxes.head.vertical_magnetism_multiplier = 5.0; 
        }
    }
}

// ==========================================
// 3. ENGINE 2: LOCK-HEAD (SUPER-GLUE)
// ==========================================
class LockHeadEngine {
    
    /**
     * Kẹp chặt trục Y (Y-Axis Clamping) và ép tọa độ nội suy (Center of Mass)
     */
    applySuperGlue(player) {
        if (!player || !player.head_pos || !player.chest_pos) return;

        const headHeight = player.hitboxes?.head?.m_Height || 0.2;
        
        // 1. Tọa độ mục tiêu hoàn hảo: Trán (Golden Ratio)
        const perfectLockY = player.head_pos.y + (headHeight * AdvancedMath.getGoldenRatio());
        
        // 2. Tọa độ giới hạn tuyệt đối: Đỉnh đầu
        const absoluteTopY = player.head_pos.y + (headHeight * 0.85);

        // Ghi đè trọng tâm nội suy của Engine game
        if (player.center_of_mass) {
            // Ép trọng tâm lên hẳn vùng đầu
            player.center_of_mass.y = perfectLockY;
            
            // Khóa cứng, không bao giờ được phép vượt quá đỉnh đầu
            player.center_of_mass.y = AdvancedMath.clamp(player.center_of_mass.y, player.chest_pos.y, absoluteTopY);
        }

        return { x: player.head_pos.x, y: perfectLockY, z: player.head_pos.z };
    }

    /**
     * Đóng băng trạng thái súng và camera khi đã Lock
     */
    freezeState(weapon, camera, perfectPoint) {
        // Khóa súng (Zero-Recoil cho SMG/AR)
        if (weapon) {
            weapon.recoil = 0.0;
            weapon.spread = 0.0;
            weapon.progressive_spread = 0.0;
            weapon.recoil_accumulation = 0.0;
            weapon.bloom = 0.0;
            weapon.horizontal_recoil = 0.0;
        }

        // Khóa Camera (Stickiness)
        if (camera) {
            camera.forced_target = perfectPoint;
            camera.lock_bone = "bone_Head";
            camera.stickiness = 1.0; // Dán keo tâm ngắm
            camera.interpolation = "ZERO"; // Xóa độ trễ trượt tâm
        }
    }
}

// ==========================================
// 4. BỘ ĐIỀU PHỐI (SHADOWROCKET INTEGRATION)
// ==========================================
class V39Coordinator {
    constructor() {
        this.dragEngine = new DragAssistEngine();
        this.lockEngine = new LockHeadEngine();
    }

    process(data) {
        if (!data || !Array.isArray(data.players)) return data;

        let perfectLockPoint = null;

        for (let enemy of data.players) {
            // Giai đoạn 1: Chuẩn bị đường băng Drag
            this.dragEngine.eliminateFriction(enemy.hitboxes);
            this.dragEngine.igniteCatapult(enemy.hitboxes);

            // Giai đoạn 2: Tính toán điểm Lock bằng keo dán
            perfectLockPoint = this.lockEngine.applySuperGlue(enemy);
        }

        // Giai đoạn 3: Đóng băng Camera và Vũ khí để duy trì Lock
        if (data.players.length > 0 && perfectLockPoint) {
            if (!data.camera_state) data.camera_state = {};
            this.lockEngine.freezeState(data.weapon, data.camera_state, perfectLockPoint);
        }

        return data;
    }
}

// Thực thi
const coordinator = new V39Coordinator();
if (typeof $response !== "undefined" && $response.body) {
    try {
        const payload = JSON.parse($response.body);
        $done({ body: JSON.stringify(coordinator.process(payload)) });
    } catch (e) {
        $done({ body: $response.body }); 
    }
}
