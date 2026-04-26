/**
 * ==============================================================================
 * QUANTUM REACH v63: THE EQUILIBRIUM (PID CONTROLLER)
 * Architecture: Dynamic Hit-Confirmation Damping + Absolute Void Body
 * Optimization: Soft-Lock after Headshot, Anti-Drop Mechanism
 * ==============================================================================
 */

class QuantumEquilibrium {
    constructor() {
        this.maxPull = 999999.0;     // Lực hút quét mục tiêu ban đầu
        this.voidPush = -999999.0;   // Lực đẩy cơ thể để chống rớt tâm
        this.anchorPull = 35.0;      // Mức "Cân bằng động" sau khi đã có Headshot (Vừa đủ giữ)
        
        this.bodyBones = [
            'root', 'spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips', 
            'left_arm', 'right_arm', 'left_leg', 'right_leg', 'shoulder', 'thigh', 'calf'
        ];
    }

    // Hàm nhận diện trạng thái trúng đạn (Hit Detection Logic)
    isTargetTakingHeadshots(player, camera) {
        // Kiểm tra các cờ dữ liệu (flags) thường xuất hiện trong gói tin mạng khi có giao tranh
        const isFiring = camera && camera.is_firing === true;
        const hasRecentDamage = player.recent_damage && player.recent_damage > 0;
        const isHitFlag = player.is_hit === true;
        const hitHeadFlag = player.last_hit_bone === "bone_Head";

        // Trả về True nếu súng đang nhả đạn và mục tiêu đang nhận sát thương
        return (isFiring || hasRecentDamage || isHitFlag || hitHeadFlag);
    }

    applyDynamicMagnetism(hitboxes, distance, isHittingHead) {
        if (!hitboxes) return;

        // BƯỚC 1: Lực đẩy vĩnh cửu tại vùng Thân (Chống rớt tâm)
        // Bất kể đạn trúng hay trượt, thân người luôn là "Bóng ma từ tính"
        for (let bone of this.bodyBones) {
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidPush; // Đẩy Crosshair lên
                hitboxes[bone].priority = "IGNORE";
                hitboxes[bone].m_Radius = 0.00001; 
                hitboxes[bone].vertical_magnetism_multiplier = 0.0; 
                hitboxes[bone].friction = 0.0;
            }
        }

        // BƯỚC 2: Cân bằng động tại vùng Đầu (PID Damping)
        if (hitboxes.head) {
            hitboxes.head.priority = "MAXIMUM";
            hitboxes.head.m_Radius = distance > 40.0 ? hitboxes.head.m_Radius * 40.0 : hitboxes.head.m_Radius * 20.0;

            if (isHittingHead) {
                // TRẠNG THÁI 2: ĐÃ TRÚNG HEADSHOT -> GIẢM ÁP SUẤT
                // Tâm súng nhẹ lại, không phản kháng lực tay quá mạnh, nhưng không rớt xuống ngực được do ngực đẩy lên
                hitboxes.head.snap_weight = this.anchorPull * 10; 
                hitboxes.head.vertical_magnetism_multiplier = this.anchorPull; 
                hitboxes.head.friction = this.anchorPull * 2; 
            } else {
                // TRẠNG THÁI 1: TÌM KIẾM MỤC TIÊU -> HÚT CỰC ĐẠI
                // Ép tâm súng bay thẳng lên đầu trong chớp mắt
                hitboxes.head.snap_weight = this.maxPull; 
                hitboxes.head.vertical_magnetism_multiplier = this.maxPull; 
                hitboxes.head.friction = 500.0; // Phanh tạm thời
            }
        }

        if (hitboxes.neck) {
            hitboxes.neck.snap_weight = isHittingHead ? this.anchorPull : this.maxPull * 0.5;
        }
    }

    hijackCoordinate(player, selfVel) {
        if (!player || !player.head_pos || !player.center_of_mass) return;

        const BULLET_SPEED = 99999.0; 
        const dist = player.distance || 15.0;
        const targetVel = player.velocity || { x: 0, y: 0, z: 0 };
        const timeDelta = (dist / BULLET_SPEED) + 0.001; 

        // Khóa X, Z
        player.center_of_mass.x = player.head_pos.x + ((targetVel.x - selfVel.x) * timeDelta);
        player.center_of_mass.z = player.head_pos.z + ((targetVel.z - selfVel.z) * timeDelta);
        
        // Neo Y ngay giữa trán
        player.center_of_mass.y = player.head_pos.y - 0.03; 
    }

    processRecursive(node, context = { selfVel: {x:0, y:0, z:0}, camera: null }) {
        if (typeof node !== 'object' || node === null) return node;

        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
                node[i] = this.processRecursive(node[i], context);
            }
            return node;
        }

        if ('player_velocity' in node) context.selfVel = node.player_velocity;
        if ('camera_state' in node) context.camera = node.camera_state;

        if ('weapon' in node) {
            node.weapon.recoil = 0.0;
            node.weapon.spread = 0.0;
            node.weapon.bullet_speed = 99999.0;
        }

        if ('players' in node && Array.isArray(node.players)) {
            for (let enemy of node.players) {
                // Kích hoạt logic Cân bằng động dựa trên nhận diện sát thương
                const isDampingActive = this.isTargetTakingHeadshots(enemy, context.camera);
                this.applyDynamicMagnetism(enemy.hitboxes, enemy.distance || 15.0, isDampingActive);
                this.hijackCoordinate(enemy, context.selfVel);
            }
        }

        for (const key of Object.keys(node)) {
            if (typeof node[key] === 'object' && !['center_of_mass', 'head_pos', 'chest_pos', 'velocity'].includes(key)) {
                node[key] = this.processRecursive(node[key], context);
            }
        }

        return node;
    }
}

// ==============================================================================
// SHADOWROCKET EXECUTION
// ==============================================================================
if (typeof $response !== "undefined" && $response.body) {
    try {
        const payload = JSON.parse($response.body);
        const Engine = new QuantumEquilibrium();
        const mutatedPayload = Engine.processRecursive(payload);
        $done({ body: JSON.stringify(mutatedPayload) });
    } catch (error) {
        $done({ body: $response.body }); 
    }
}
