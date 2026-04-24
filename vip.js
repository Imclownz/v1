/**
 * ==============================================================================
 * QUANTUM REACH v51.0 (MAXIMUM OVERDRIVE)
 * Architecture: Deep Recursive Schema-Agnostic + Polynomial Slingshot
 * Status: Absolute Interception. Zero-Latency Logic.
 * ==============================================================================
 */

class QuantumMath {
    static clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    /**
     * TỐI ĐA HÓA LOGIC 1: Đa thức Bù trừ Y (Polynomial Interpolation)
     * Thay vì chia cự ly thành các bậc cứng nhắc, sử dụng đường cong Bezier bậc 2 
     * để tính toán tỷ lệ khóa tâm mềm mại và chính xác tuyệt đối ở mọi khoảng cách lẻ (ví dụ 33.5m).
     */
    static getPolynomialY(dist) {
        if (dist <= 5.0) return 0.75;
        if (dist >= 80.0) return 0.15;
        
        const t = (dist - 5.0) / 75.0;
        return 0.75 * (1 - t) * (1 - t) + 0.45 * 2 * (1 - t) * t + 0.15 * t * t;
    }

    /**
     * TỐI ĐA HÓA LOGIC 2: Bù trừ Độ trễ Hệ thống (Net & Frame Latency)
     * Cộng thêm hằng số 0.015s (BASE_DELAY) để bù trừ thời gian CPU xử lý khung hình,
     * kết hợp với Ping và Vận tốc đạn 9999.0 để ra tọa độ hội tụ tương lai.
     */
    static predict(pos, vT, vS, dist, ping) {
        const BULLET_SPEED = 99999.0;
        const BASE_DELAY = 0.015; 
        const timeDelta = (dist / BULLET_SPEED) + (ping / 1000.0) + BASE_DELAY;

        return {
            x: pos.x + ((vT.x - vS.x) * timeDelta),
            y: pos.y + ((vT.y - vS.y) * timeDelta),
            z: pos.z + ((vT.z - vS.z) * timeDelta)
        };
    }
}

class QuantumEngine {
    constructor() {
        this.singularityWeight = 99999.0;
        this.voidWeight = -99999.0;

        // TỐI ĐA HÓA LOGIC 3: Mở rộng Tập hợp Triệt tiêu Vũ khí
        // Đưa thêm các biến phục hồi (recovery) và lắc lư (sway) vào danh sách quét.
        this.nullifySet = new Set([
            'recoil', 'spread', 'camera_shake', 'progressive_spread', 
            'recoil_accumulation', 'recoil_multiplier', 'horizontal_recoil', 
            'vertical_recoil', 'bloom', 'movement_penalty', 'jump_penalty',
            'recoil_recovery_rate', 'spread_recovery_rate', 'weapon_sway'
        ]);

        // Mở rộng các xương phụ thuộc vùng thân (vai) để loại bỏ hoàn toàn khả năng kẹt tâm.
        this.ignoreBones = new Set([
            'root', 'spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips', 
            'left_arm', 'right_arm', 'left_leg', 'right_leg', 'left_shoulder', 'right_shoulder'
        ]);
    }

    applyRecursive(node, context = { vS: {x:0, y:0, z:0}, ping: 15, dist: 15.0 }) {
        if (!node || typeof node !== 'object') return node;

        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
                node[i] = this.applyRecursive(node[i], context);
            }
            return node;
        }

        // Đồng bộ hóa Context
        if (node.distance !== undefined) context.dist = node.distance;
        if (node.ping !== undefined) context.ping = node.ping;
        if (node.player_velocity !== undefined) context.vS = node.player_velocity;

        // BƯỚC 1: Cưỡng chế Vô hiệu hóa Vật lý Vũ khí (Absolute Zero Normalization)
        for (const key of this.nullifySet) {
            if (node[key] !== undefined) node[key] = 0.0;
        }
        if (node.aim_assist_range !== undefined) node.aim_assist_range = 99999.0;
        if (node.bullet_speed !== undefined) node.bullet_speed = 99999.0;

        // BƯỚC 2: Thao túng Xương và Gia tốc Vuốt (Magnetic Singularity & Slingshot)
        for (const key in node) {
            const bone = node[key];
            if (bone && typeof bone === 'object' && bone.snap_weight !== undefined) {
                // Tối đa hóa: Gỡ bỏ hoàn toàn lực cản ma sát trên TẤT CẢ các xương.
                bone.friction = 0.0;

                if (key === 'head') {
                    bone.snap_weight = this.singularityWeight;
                    bone.priority = "MAXIMUM";
                    // Phình to Hitbox linh hoạt theo cự ly
                    bone.m_Radius *= (context.dist < 15.0 ? 15.0 : (context.dist > 50.0 ? 5.0 : 10.0));
                    // Ép xung lực hút khi vuốt dọc
                    bone.vertical_magnetism_multiplier = 25.0; 
                    bone.horizontal_magnetism_multiplier = 10.0;
                } else if (key === 'neck') {
                    bone.snap_weight = this.singularityWeight * 0.5;
                    bone.priority = "HIGH";
                    bone.m_Radius *= 2.0;
                } else if (this.ignoreBones.has(key)) {
                    bone.snap_weight = this.voidWeight;
                    bone.priority = "IGNORE";
                    bone.m_Radius = 0.0001; // Ép Hitbox thân về kích thước vi mô
                    bone.vertical_magnetism_multiplier = 0.0;
                }
            }
        }

        // BƯỚC 3: Thao túng Trọng tâm & Nội suy Tọa độ (Vector Intercept Prediction)
        if (node.center_of_mass && node.head_pos && node.chest_pos) {
            const vT = node.velocity || {x:0, y:0, z:0};
            const pHead = QuantumMath.predict(node.head_pos, vT, context.vS, context.dist, context.ping);
            const offsetY = QuantumMath.getPolynomialY(context.dist);

            node.center_of_mass.x = pHead.x;
            node.center_of_mass.z = pHead.z;
            node.center_of_mass.y = node.chest_pos.y + offsetY;

            // Strict Ceil Clamp: Chống văng tâm vọt qua đỉnh đầu ở cự ly quá gần
            const maxSafeY = node.head_pos.y + 0.10;
            node.center_of_mass.y = QuantumMath.clamp(node.center_of_mass.y, node.chest_pos.y, maxSafeY);
        }

        // BƯỚC 4: Chiếm quyền Camera (Camera Override)
        if (node.camera_state) {
            node.camera_state.stickiness = 1.0;
            node.camera_state.lock_bone = "bone_Head";
            node.camera_state.interpolation = "ZERO";
            node.camera_state.aim_acceleration = 0.0;
        }

        // Tiếp tục vòng lặp Đệ quy
        for (const key in node) {
            if (typeof node[key] === 'object' && key !== 'center_of_mass' && key !== 'velocity') {
                this.applyRecursive(node[key], context);
            }
        }

        return node;
    }
}

// ==============================================================================
// KHỞI CHẠY HỆ THỐNG
// ==============================================================================
if (typeof $response !== "undefined" && $response.body) {
    try {
        let root = JSON.parse($response.body);
        const Quantum = new QuantumEngine();
        root = Quantum.applyRecursive(root);
        $done({ body: JSON.stringify(root) });
    } catch (e) {
        $done({ body: $response.body });
    }
}
