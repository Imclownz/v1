/**
 * ==============================================================================
 * QUANTUM REACH v60.1: ABSOLUTE Y-FREEZE (THE GOD CODE EVOLVED)
 * Architecture: Slide & Freeze, Zero-Pitch Override, Tri-Anchor Hijacking
 * Status: OMNISCIENCE MODE. Infinite Drag Tolerance. Zero Overshoot.
 * ==============================================================================
 */

class QuantumMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    /**
     * DỰ ĐOÁN TỨC THỜI (INSTANT INTERCEPT)
     */
    static predictGodMode(targetPos, targetVel, selfVel, distance) {
        const BULLET_SPEED = 99999.0; 
        const timeDelta = (distance / BULLET_SPEED) + 0.001; 
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
        
        // Danh sách xương bị hóa "Bóng ma" (Chỉ giữ lại Đầu và Cổ)
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

        weapon.aim_assist_range = 600.0; 
        weapon.auto_aim_angle = 360.0; 
        weapon.bullet_speed = 99999.0; 
        if ('range_damage_falloff' in weapon) weapon.range_damage_falloff = 0.0; 
    }

    // 2. VÙNG TRƯỢT TỐC ĐỘ CAO & BỨC TƯỜNG MA SÁT ĐỈNH ĐẦU
    warpHitboxes(hitboxes, distance) {
        if (!hitboxes) return;

        // Bôi trơn vùng thân: Vuốt xuyên qua không gặp cản trở
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

        // Bức tường ma sát tuyệt đối tại Đầu
        if (hitboxes.head) {
            let auraMultiplier = distance < 20.0 ? 25.0 : (distance > 50.0 ? 50.0 : 35.0);

            hitboxes.head.snap_weight = this.godWeight; 
            hitboxes.head.priority = "MAXIMUM";
            hitboxes.head.m_Radius *= auraMultiplier; 
            
            // Lực khóa cứng tại điểm tiếp xúc
            hitboxes.head.vertical_magnetism_multiplier = this.godWeight; 
            hitboxes.head.horizontal_magnetism_multiplier = this.godWeight;
            hitboxes.head.friction = this.godWeight; 
        }

        if (hitboxes.neck) {
            hitboxes.neck.snap_weight = this.godWeight * 0.8;
            hitboxes.neck.priority = "HIGH";
            hitboxes.neck.friction = this.godWeight; 
        }
    }

    // 3. DỊCH CHUYỂN TRỌNG TÂM AN TOÀN
    hijackCoordinate(player, selfVel) {
        if (!player || !player.head_pos || !player.center_of_mass) return;

        const dist = player.distance || 15.0;
        const targetVel = player.velocity || { x: 0, y: 0, z: 0 };
        
        const interceptPos = QuantumMath.predictGodMode(player.head_pos, targetVel, selfVel, dist);

        player.center_of_mass.x = interceptPos.x;
        player.center_of_mass.z = interceptPos.z;
        
        // Neo tĩnh tọa độ Y cách đỉnh đầu một chút để không lọt qua mép trên hitbox
        const safeY = player.head_pos.y - 0.05; 
        player.center_of_mass.y = safeY;
    }

    // 4. CƠ CHẾ ĐÓNG BĂNG TRỤC Y (Y-AXIS FREEZE)
    freezeYAxisCamera(cameraState) {
        if (!cameraState) return;
        
        // Khóa mục tiêu triệt để
        cameraState.stickiness = this.godWeight; 
        cameraState.lock_bone = "bone_Head";
        cameraState.interpolation = "ZERO"; 
        
        // TRIỆT TIÊU MỌI GIA TỐC VÀ ĐỘ NHẠY DỌC (Cắt đứt tín hiệu vuốt lên)
        const verticalLocks = [
            'max_pitch_velocity', 
            'pitch_speed', 
            'vertical_sensitivity_multiplier', 
            'aim_acceleration_y',
            'pitch_acceleration'
        ];

        for (let prop of verticalLocks) {
            if (prop in cameraState) {
                cameraState[prop] = 0.0;
            }
        }
        
        // Đảm bảo trục ngang (Yaw) vẫn có thể hoạt động một phần để tracking địch chạy ngang
        if ('max_yaw_velocity' in cameraState && cameraState.max_yaw_velocity === 0) {
             cameraState.max_yaw_velocity = 1.0; 
        }
    }

    // THUẬT TOÁN ĐỆ QUY (RECURSIVE TRAVERSAL)
    processRecursive(node, context = { selfVel: {x:0, y:0, z:0} }) {
        if (typeof node !== 'object' || node === null) return node;

        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
                node[i] = this.processRecursive(node[i], context);
            }
            return node;
        }

        if ('player_velocity' in node) context.selfVel = node.player_velocity;
        if ('weapon' in node) this.enforceZeroPoint(node.weapon);

        if ('players' in node && Array.isArray(node.players)) {
            for (let i = 0; i < node.players.length; i++) {
                const enemy = node.players[i];
                const dist = enemy.distance || 15.0;
                
                this.warpHitboxes(enemy.hitboxes, dist);
                this.hijackCoordinate(enemy, context.selfVel);
            }
        }

        if ('camera_state' in node) {
            this.freezeYAxisCamera(node.camera_state);
        }

        for (const key of Object.keys(node)) {
            if (typeof node[key] === 'object' && key !== 'center_of_mass' && key !== 'head_pos' && key !== 'chest_pos' && key !== 'velocity') {
                node[key] = this.processRecursive(node[key], context);
            }
        }

        return node;
    }
}

// ==============================================================================
// SHADOWROCKET EXECUTION BLOCK 
// ==============================================================================
if (typeof $response !== "undefined" && $response.body) {
    try {
        const payload = JSON.parse($response.body);
        const Engine = new QuantumGodEngine();
        const mutatedPayload = Engine.processRecursive(payload);
        $done({ body: JSON.stringify(mutatedPayload) });
    } catch (error) {
        $done({ body: $response.body }); 
    }
}
