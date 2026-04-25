/**
 * ==============================================================================
 * QUANTUM REACH v61: THE STABILIZER (PRECISION OVERDRIVE)
 * Architecture: Relative Vector Sync + Dynamic Damping + Anti-Overshoot Dome
 * Optimization: Long-Range Stability, Crosshair Drift Correction
 * ==============================================================================
 */

class QuantumPhysics {
    /**
     * THUẬT TOÁN ĐỒNG BỘ VECTOR TƯƠNG ĐỐI (RELATIVE VECTOR SYNC)
     * Tính toán vận tốc hiệu dụng: $\vec{V}_{eff} = \vec{V}_{target} - \vec{V}_{self}$
     * Triệt tiêu hoàn toàn sự lệch tâm khi bạn vừa chạy vừa bắn.
     */
    static predictStabilized(targetPos, targetVel, selfVel, distance, ping) {
        const BULLET_SPEED = 99999.0;
        // Tính toán vận tốc tương đối để bù trừ sai lệch vị trí trong không gian 3D
        const relVel = {
            x: targetVel.x - selfVel.x,
            y: targetVel.y - selfVel.y,
            z: targetVel.z - selfVel.z
        };
        
        const timeOffset = (distance / BULLET_SPEED) + (ping / 1000.0) + 0.005;
        
        return {
            x: targetPos.x + (relVel.x * timeOffset),
            y: targetPos.y + (relVel.y * timeOffset),
            z: targetPos.z + (relVel.z * timeOffset)
        };
    }

    static clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }
}

class QuantumStabilizerEngine {
    constructor() {
        this.baseWeight = 999999.0;
        this.voidWeight = -999999.0;
        this.ghostBones = ['root', 'spine', 'chest', 'pelvis', 'hips', 'arm', 'leg', 'shoulder', 'thigh', 'foot'];
    }

    // 1. PHANH TỪ TÍNH THEO CỰ LY (DYNAMIC DAMPING)
    // Càng xa, đầu kẻ địch càng "stick" hơn để chống văng tâm do vuốt quá tay.
    calculateDamping(distance) {
        const dampingFactor = QuantumPhysics.clamp(distance / 20.0, 1.0, 50.0);
        return this.baseWeight * dampingFactor;
    }

    // 2. VÒM BẢO VỆ ĐỈNH ĐẦU (ANTI-OVERSHOOT DOME)
    applyDomePhysics(hitboxes, distance) {
        if (!hitboxes || !hitboxes.head) return;

        const stickiness = this.calculateDamping(distance);
        
        // Cấu hình xương đầu thành một "Hố đen ma sát"
        hitboxes.head.snap_weight = this.baseWeight;
        hitboxes.head.priority = "MAXIMUM";
        hitboxes.head.friction = stickiness; // Phanh quán tính cực mạnh
        hitboxes.head.vertical_magnetism_multiplier = stickiness;
        
        // Mở rộng Hitbox Headshot theo cự ly (Maximized for Long Range)
        let auraSize = distance > 50.0 ? 60.0 : 30.0;
        hitboxes.head.m_Radius *= auraSize;

        // Triệt tiêu các vùng xương khác để làm mượt đường trượt lên đầu
        for (const bone of this.ghostBones) {
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight;
                hitboxes[bone].m_Radius = 0.00001;
                hitboxes[bone].friction = 0.0;
            }
        }
    }

    // 3. NEO GIỮ TRỌNG TÂM 4D (STABILIZED HIJACKING)
    stabilizeTarget(player, selfVel, ping) {
        if (!player || !player.head_pos || !player.center_of_mass) return;

        const dist = player.distance || 20.0;
        const targetVel = player.velocity || { x: 0, y: 0, z: 0 };
        
        // Dự đoán tọa độ với Vector tương đối
        const stabilizedPos = QuantumPhysics.predictStabilized(player.head_pos, targetVel, selfVel, dist, ping);

        player.center_of_mass.x = stabilizedPos.x;
        player.center_of_mass.z = stabilizedPos.z;

        /**
         * MÁI VÒM TRẦN TUYỆT ĐỐI (ABSOLUTE CEILING)
         * Đạn luôn bị ép vào vùng trán, không bao giờ vượt quá đỉnh đầu.
         * $Y_{target} = Y_{head} - 0.025$
         */
        const headTop = player.head_pos.y;
        const targetY = headTop - 0.025;
        
        // Nếu dự đoán vượt quá trần, ép nó quay lại mục tiêu Headshot
        player.center_of_mass.y = QuantumPhysics.clamp(stabilizedPos.y, headTop - 0.15, targetY);
    }

    processRecursive(node, context = { vS: {x:0, y:0, z:0}, p: 20 }) {
        if (typeof node !== 'object' || node === null) return node;

        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
                node[i] = this.processRecursive(node[i], context);
            }
            return node;
        }

        if (node.player_velocity) context.vS = node.player_velocity;
        if (node.ping) context.p = node.ping;

        if (node.weapon) {
            node.weapon.recoil = 0.0;
            node.weapon.spread = 0.0;
            node.weapon.bullet_speed = 99999.0;
            node.weapon.aim_assist_range = 600.0;
            node.weapon.auto_aim_angle = 360.0;
        }

        if (node.players && Array.isArray(node.players)) {
            for (let player of node.players) {
                this.applyDomePhysics(player.hitboxes, player.distance);
                this.stabilizeTarget(player, context.vS, context.p);
            }
        }

        if (node.camera_state) {
            node.camera_state.stickiness = this.baseWeight;
            node.camera_state.interpolation = "ZERO";
            node.camera_state.aim_acceleration = 0.0;
            // CẮT CỤT TÍN HIỆU VƯỢT TRẦN: Khóa cứng vận tốc góc chiều dọc
            node.camera_state.max_pitch_velocity = 0.0; 
            node.camera_state.lock_bone = "bone_Head";
        }

        for (const key of Object.keys(node)) {
            if (typeof node[key] === 'object' && !['center_of_mass', 'velocity', 'head_pos'].includes(key)) {
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
        const Engine = new QuantumStabilizerEngine();
        const output = Engine.processRecursive(payload);
        $done({ body: JSON.stringify(output) });
    } catch (e) {
        $done({ body: $response.body });
    }
}
