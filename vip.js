/**
 * ==============================================================================
 * QUANTUM REACH v60: THE GOD CODE (REALITY WARPING ENGINE)
 * Architecture: Absolute Ceiling, Friction Wall, Ghost Body, Instant Intercept
 * Status: OMNISCIENCE MODE. Zero Tolerance. Maximum Overdrive.
 * ==============================================================================
 */

class QuantumMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    /**
     * DỰ ĐOÁN TỨC THỜI (INSTANT INTERCEPT)
     * Vận tốc đạn được ép xung cực đại, loại bỏ hoàn toàn thời gian đạn bay (Travel Time).
     * Bỏ qua độ trễ Ping vật lý, buộc tọa độ tương lai trùng khớp với tọa độ hiện tại.
     */
    static predictGodMode(targetPos, targetVel, selfVel, distance) {
        const BULLET_SPEED = 99999.0; 
        const timeDelta = (distance / BULLET_SPEED) + 0.001; // Ép thời gian trễ về gần 0 nhất có thể
        return {
            x: targetPos.x + ((targetVel.x - selfVel.x) * timeDelta),
            y: targetPos.y + ((targetVel.y - selfVel.y) * timeDelta),
            z: targetPos.z + ((targetVel.z - selfVel.z) * timeDelta)
        };
    }
}

class QuantumGodEngine {
    constructor() {
        this.godWeight = 999999.0;
        this.voidWeight = -999999.0;
        
        // Danh sách toàn bộ xương cơ thể (trừ Đầu và Cổ) để hóa thành "Bóng Ma"
        this.ghostBones = [
            'root', 'spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips', 
            'left_arm', 'right_arm', 'left_leg', 'right_leg', 
            'left_shoulder', 'right_shoulder', 'left_thigh', 'right_thigh', 
            'left_calf', 'right_calf', 'left_foot', 'right_foot', 'left_hand', 'right_hand'
        ];
    }

    // 1. GIAO THỨC ZERO POINT (HỎA LỰC TUYỆT ĐỐI)
    enforceZeroPoint(weapon) {
        if (!weapon) return;
        
        const nullifyProps = [
            'recoil', 'spread', 'camera_shake', 'progressive_spread', 
            'recoil_accumulation', 'recoil_multiplier', 'horizontal_recoil', 
            'vertical_recoil', 'bloom', 'movement_penalty', 'jump_penalty', 'strafe_penalty',
            'weapon_sway', 'recoil_recovery_rate'
        ];

        for (let i = 0; i < nullifyProps.length; i++) {
            if (nullifyProps[i] in weapon) weapon[nullifyProps[i]] = 0.0;
        }

        // Tầm bắn cực hạn: Phủ sóng toàn bản đồ (Render Distance Limit)
        weapon.aim_assist_range = 600.0; 
        weapon.auto_aim_angle = 360.0; // Mở góc quét Aim Assist thành vòng tròn hoàn hảo
        weapon.bullet_speed = 99999.0; // Tốc độ đạn ánh sáng
        if ('range_damage_falloff' in weapon) weapon.range_damage_falloff = 0.0; // Sát thương giữ nguyên ở mọi cự ly
    }

    // 2. VÙNG TRŨNG HỐ ĐEN & BỨC TƯỜNG MA SÁT
    warpHitboxes(hitboxes, distance) {
        if (!hitboxes) return;

        // Triệt tiêu thân thể: Xóa bỏ ma sát, đẩy lùi từ tính, thu nhỏ Hitbox về hạt bụi
        for (let i = 0; i < this.ghostBones.length; i++) {
            const bone = this.ghostBones[i];
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight;
                hitboxes[bone].priority = "IGNORE";
                hitboxes[bone].m_Radius = 0.00001; 
                hitboxes[bone].friction = 0.0; 
                hitboxes[bone].vertical_magnetism_multiplier = 0.0; 
                hitboxes[bone].horizontal_magnetism_multiplier = 0.0;
            }
        }

        // Hào quang Headshot: Bức tường ma sát tuyệt đối
        if (hitboxes.head) {
            // Phóng to hitbox lên 50 lần so với v50. Bao trùm toàn bộ khu vực phía trên đối thủ.
            let auraMultiplier = distance < 20.0 ? 25.0 : (distance > 50.0 ? 50.0 : 35.0);

            hitboxes.head.snap_weight = this.godWeight; 
            hitboxes.head.priority = "MAXIMUM";
            hitboxes.head.m_Radius *= auraMultiplier; 
            
            // Hard-lock: Khi tâm chạm vào vùng hào quang, ma sát và từ tính đạt đỉnh điểm
            hitboxes.head.vertical_magnetism_multiplier = this.godWeight; 
            hitboxes.head.friction = this.godWeight; 
        }

        if (hitboxes.neck) {
            hitboxes.neck.snap_weight = this.godWeight * 0.8;
            hitboxes.neck.priority = "HIGH";
            hitboxes.neck.friction = this.godWeight; 
            hitboxes.neck.vertical_magnetism_multiplier = this.godWeight;
        }
    }

    // 3. DỊCH CHUYỂN TRỌNG TÂM & CHỐNG VƯỢT ĐẦU TUYỆT ĐỐI
    hijackCoordinate(player, selfVel) {
        if (!player || !player.head_pos || !player.center_of_mass) return;

        const dist = player.distance || 15.0;
        const targetVel = player.velocity || { x: 0, y: 0, z: 0 };
        
        const interceptPos = QuantumMath.predictGodMode(player.head_pos, targetVel, selfVel, dist);

        // Khóa tọa độ X, Z thẳng vào tâm trán
        player.center_of_mass.x = interceptPos.x;
        player.center_of_mass.z = interceptPos.z;
        
        // TRẦN TUYỆT ĐỐI (ABSOLUTE CEILING): 
        // Neo cứng đạn vào tọa độ Y ngay dưới đỉnh đầu 2 centimet. Vĩnh viễn không vọt tâm.
        const absoluteCeiling = player.head_pos.y - 0.02; 
        player.center_of_mass.y = QuantumMath.clamp(interceptPos.y, player.chest_pos ? player.chest_pos.y + 0.3 : absoluteCeiling - 0.1, absoluteCeiling);
    }

    // THUẬT TOÁN ĐỆ QUY (RECURSIVE TRAVERSAL) - Tự động tìm diệt trong mọi cấu trúc JSON
    processRecursive(node, context = { selfVel: {x:0, y:0, z:0} }) {
        if (typeof node !== 'object' || node === null) return node;

        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
                node[i] = this.processRecursive(node[i], context);
            }
            return node;
        }

        // Thu thập ngữ cảnh
        if ('player_velocity' in node) context.selfVel = node.player_velocity;
        if ('weapon' in node) this.enforceZeroPoint(node.weapon);

        // Xử lý danh sách người chơi
        if ('players' in node && Array.isArray(node.players)) {
            for (let i = 0; i < node.players.length; i++) {
                const enemy = node.players[i];
                const dist = enemy.distance || 15.0;
                
                this.warpHitboxes(enemy.hitboxes, dist);
                this.hijackCoordinate(enemy, context.selfVel);
            }
        }

        // 4. NHÃN QUAN CỦA THẦN (CAMERA OVERRIDE)
        if ('camera_state' in node) {
            node.camera_state.stickiness = this.godWeight; 
            node.camera_state.interpolation = "ZERO"; // Cắt đứt mọi hoạt ảnh chuyển cảnh (Snap)
            node.camera_state.aim_acceleration = 0.0;
            node.camera_state.max_pitch_velocity = 0.0; // Đóng băng trục Y của camera khi đã Lock
            node.camera_state.lock_bone = "bone_Head";
        }

        // Tiếp tục duyệt sâu để không bỏ sót bất kỳ thông số ẩn nào
        for (const key of Object.keys(node)) {
            if (typeof node[key] === 'object' && key !== 'center_of_mass' && key !== 'head_pos' && key !== 'chest_pos' && key !== 'velocity') {
                node[key] = this.processRecursive(node[key], context);
            }
        }

        return node;
    }
}

// ==============================================================================
// SHADOWROCKET EXECUTION BLOCK (BINARY-MODE OPTIMIZED)
// ==============================================================================
if (typeof $response !== "undefined" && $response.body) {
    try {
        const payload = JSON.parse($response.body);
        const Engine = new QuantumGodEngine();
        const mutatedPayload = Engine.processRecursive(payload);
        $done({ body: JSON.stringify(mutatedPayload) });
    } catch (error) {
        $done({ body: $response.body }); // Trả về nguyên gốc nếu có lỗi để chống văng game
    }
}
