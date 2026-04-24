/**
 * ==============================================================================
 * QUANTUM REACH v51.0 (ULTIMATE FUSION)
 * Architecture: Deep Recursive Schema-Agnostic + Vertical Slingshot Assist
 * Optimization: Absolute Logic Interception for iOS Standalone Environment
 * ==============================================================================
 */

class QuantumMath {
    /**
     * Giới hạn giá trị trong khoảng an toàn.
     */
    static clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    /**
     * Thuật toán Adaptive Y-Clamping: Điều chỉnh điểm khóa dựa trên cự ly.
     * Càng xa điểm khóa càng hạ thấp về phía cằm để bù trừ trọng lực và nảy vi mô.
     */
    static getAdaptiveY(dist) {
        if (dist <= 10.0) return 0.68; // Khóa trán tầm gần
        if (dist <= 45.0) return 0.68 - (0.33 * ((dist - 10.0) / 35.0)); 
        return 0.35; // Khóa cằm/cổ tầm xa
    }

    /**
     * Thuật toán Intercept Prediction: Dự đoán vị trí tương lai của mục tiêu.
     * Tính toán dựa trên vận tốc tương đối và độ trễ mạng (Ping).
     */
    static predict(pos, vT, vS, dist, ping) {
        const bulletSpeed = 9999.0; // Ép xung tốc độ đạn
        const time = (dist / bulletSpeed) + (ping / 1000.0) + 0.015;
        return {
            x: pos.x + ((vT.x - vS.x) * time),
            y: pos.y + ((vT.y - vS.y) * time),
            z: pos.z + ((vT.z - vS.z) * time)
        };
    }
}

class QuantumEngine v51 {
    constructor() {
        this.voidWeight = -99999.0; // Triệt tiêu từ tính vùng thân
        this.singularityWeight = 99999.0; // Cực đại hóa từ tính vùng đầu
        
        // Danh sách các biến vũ khí cần triệt tiêu hoàn toàn
        this.nullifySet = new Set([
            'recoil', 'spread', 'camera_shake', 'progressive_spread', 
            'recoil_accumulation', 'recoil_multiplier', 'horizontal_recoil', 
            'vertical_recoil', 'bloom', 'movement_penalty', 'jump_penalty'
        ]);

        // Danh sách xương vùng thân để gán nhãn bỏ qua
        this.bodyBones = new Set(['root', 'spine', 'pelvis', 'chest', 'hips', 'arm', 'leg']);
    }

    /**
     * Thuật toán Duyệt đệ quy (Recursive Traversal):
     * Tự động tìm kiếm và thực thi logic trên mọi phiên bản OB mà không cần cập nhật đường dẫn.
     */
    applyRecursive(node, context = { vS: {x:0, y:0, z:0}, ping: 20, dist: 15.0 }) {
        if (!node || typeof node !== 'object') return node;

        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
                node[i] = this.applyRecursive(node[i], context);
            }
            return node;
        }

        // Cập nhật ngữ cảnh chiến đấu theo thời gian thực
        if (node.distance) context.dist = node.distance;
        if (node.ping) context.ping = node.ping;
        if (node.player_velocity) context.vS = node.player_velocity;

        // 1. Logic Laser Weapon: Triệt tiêu độ nảy và nở tâm
        for (const key in node) {
            if (this.nullifySet.has(key)) node[key] = 0.0;
        }
        if (node.aim_assist_range) node.aim_assist_range = 9999.0;
        if (node.bullet_speed) node.bullet_speed = 9999.0;

        // 2. Logic Vertical Slingshot & Magnetic Singularity
        for (const key in node) {
            const bone = node[key];
            if (bone && typeof bone === 'object' && 'snap_weight' in bone) {
                // Triệt tiêu ma sát để vuốt tâm mượt hơn
                bone.friction = 0.0;

                if (key === 'head') {
                    bone.snap_weight = this.singularityWeight;
                    bone.priority = "MAXIMUM";
                    bone.m_Radius *= (context.dist < 15 ? 15.0 : 8.0); // Phình to hitbox đầu
                    bone.vertical_magnetism_multiplier = 18.0; // Gia tốc vuốt dọc cực đại
                } else if (this.bodyBones.has(key) || key.includes('spine')) {
                    bone.snap_weight = this.voidWeight;
                    bone.priority = "IGNORE";
                    bone.m_Radius = 0.0001; // Thu nhỏ hitbox thân để tránh dính đạn
                }
            }
        }

        // 3. Logic Intercept Hijacking: Thao túng trọng tâm mục tiêu
        if (node.center_of_mass && node.head_pos && node.chest_pos) {
            const vT = node.velocity || {x:0, y:0, z:0};
            const pHead = QuantumMath.predict(node.head_pos, vT, context.vS, context.dist, context.ping);
            const offset = QuantumMath.getAdaptiveY(context.dist);

            node.center_of_mass.x = pHead.x;
            node.center_of_mass.z = pHead.z;
            node.center_of_mass.y = node.chest_pos.y + offset; // Bù trừ Y linh hoạt

            // Giới hạn an toàn để tránh bị hệ thống quét hành vi bất thường
            const limit = node.head_pos.y + 0.15;
            node.center_of_mass.y = QuantumMath.clamp(node.center_of_mass.y, node.chest_pos.y, limit);
        }

        // 4. Logic Camera Stickiness: Khóa cứng góc nhìn
        if (node.camera_state) {
            node.camera_state.stickiness = 1.0;
            node.camera_state.lock_bone = "bone_Head";
            node.camera_state.interpolation = "ZERO";
        }

        // Tiếp tục duyệt sâu vào các nhánh khác của JSON
        for (const key in node) {
            if (typeof node[key] === 'object' && key !== 'center_of_mass') {
                this.applyRecursive(node[key], context);
            }
        }

        return node;
    }
}

/**
 * ENTRY POINT: Xử lý luồng dữ liệu qua Shadowrocket Proxy.
 */
if (typeof $response !== "undefined" && $response.body) {
    try {
        let root = JSON.parse($response.body);
        const Quantum = new QuantumEngine v51();
        root = Quantum.applyRecursive(root);
        $done({ body: JSON.stringify(root) });
    } catch (e) {
        $done({ body: $response.body });
    }
}
