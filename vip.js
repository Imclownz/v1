/**
 * ==============================================================================
 * QUANTUM REACH v65: THE ANCHOR (AIRBORNE OVERRIDE EDITION)
 * Architecture: Tri-Phase State Machine + Absolute Bone Anchoring
 * Optimization: Jump-Shot Immunity, Anti-Center Drift, Zero Y-Axis Failure
 * ==============================================================================
 */

class QuantumMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    static predictInstant(targetPos, targetVel, selfVel, distance) {
        const BULLET_SPEED = 99999.0;
        const timeDelta = (distance / BULLET_SPEED) + 0.001; 
        return {
            x: targetPos.x + ((targetVel.x - selfVel.x) * timeDelta),
            y: targetPos.y + ((targetVel.y - selfVel.y) * timeDelta),
            z: targetPos.z + ((targetVel.z - selfVel.z) * timeDelta)
        };
    }
}

class AnchorEquilibriumEngine {
    constructor() {
        this.godWeight = 999999.0;
        this.voidWeight = -999999.0;
        this.balanceWeight = 150.0; 
        
        // Trục xuất hoàn toàn thân dưới khỏi tính toán
        this.ghostBones = [
            'root', 'spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips', 
            'left_arm', 'right_arm', 'left_leg', 'right_leg', 
            'left_shoulder', 'right_shoulder', 'left_thigh', 'right_thigh', 
            'left_calf', 'right_calf', 'left_foot', 'right_foot', 'left_hand', 'right_hand'
        ];
    }

    // XÁC ĐỊNH PHA CHIẾN ĐẤU (TRI-PHASE) CỦA v64
    getCombatPhase(weapon, camera) {
        let isFiring = false;
        let shotCount = 0;

        if (weapon) {
            if (weapon.is_firing || weapon.recoil_accumulation > 0) isFiring = true;
            if (weapon.shots_fired !== undefined) {
                shotCount = weapon.shots_fired;
            } else if (weapon.recoil_accumulation !== undefined) {
                shotCount = weapon.recoil_accumulation / 0.02; 
            }
        }
        
        if (camera && camera.is_firing) isFiring = true;

        if (!isFiring) return 0;       // Pha 0: Rình rập
        if (shotCount <= 2.5) return 1; // Pha 1: Khóa cứng 2 viên đầu
        return 2;                      // Pha 2: Xả áp lực (Cân bằng)
    }

    enforceZeroPoint(weapon) {
        if (!weapon) return;
        const nullifyProps = [
            'recoil', 'spread', 'bloom', 'camera_shake', 'progressive_spread', 
            'recoil_multiplier', 'horizontal_recoil', 'vertical_recoil', 
            'movement_penalty', 'jump_penalty', 'weapon_sway'
        ];
        for (let prop of nullifyProps) {
            if (prop in weapon) weapon[prop] = 0.0;
        }
        weapon.aim_assist_range = 600.0; 
        weapon.auto_aim_angle = 360.0; 
        weapon.bullet_speed = 99999.0; 
    }

    warpHitboxes(hitboxes, distance, phase, isAirborne) {
        if (!hitboxes) return;

        // BÓNG MA TUYỆT ĐỐI (ĐẨY LÊN TRÊN)
        for (let bone of this.ghostBones) {
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight;
                hitboxes[bone].priority = "IGNORE";
                hitboxes[bone].m_Radius = 0.00001; 
                hitboxes[bone].friction = 0.0; 
                // Khi kẻ địch nhảy, lực đẩy từ thân dưới càng phải mạnh để tâm không bị rớt
                hitboxes[bone].vertical_magnetism_multiplier = isAirborne ? (this.voidWeight * 2) : this.voidWeight; 
            }
        }

        if (hitboxes.head) {
            hitboxes.head.priority = "MAXIMUM";
            // Phóng to Hitbox khi kẻ địch nhảy để hứng đạn dễ hơn
            hitboxes.head.m_Radius = isAirborne ? (distance > 50.0 ? 40.0 : 25.0) : (distance > 50.0 ? 30.0 : 18.0); 
            hitboxes.head.horizontal_magnetism_multiplier = this.godWeight; 
            
            if (phase === 0 || phase === 1) {
                hitboxes.head.snap_weight = this.godWeight; 
                hitboxes.head.vertical_magnetism_multiplier = this.godWeight;
                hitboxes.head.friction = this.godWeight;
            } else if (phase === 2) {
                hitboxes.head.snap_weight = this.balanceWeight; 
                hitboxes.head.vertical_magnetism_multiplier = 40.0; 
                hitboxes.head.friction = 80.0; 
            }
        }

        if (hitboxes.neck) {
            hitboxes.neck.snap_weight = (phase === 2) ? this.balanceWeight * 0.5 : this.godWeight * 0.8;
            hitboxes.neck.priority = "HIGH";
        }
    }

    // THUẬT TOÁN NEO XƯƠNG TUYỆT ĐỐI (ABSOLUTE BONE ANCHORING)
    hijackCoordinate(player, selfVel) {
        if (!player || !player.head_pos || !player.center_of_mass) return;

        const dist = player.distance || 15.0;
        const targetVel = player.velocity || { x: 0, y: 0, z: 0 };
        
        // NHẬN DIỆN KHÔNG TRUNG (AIRBORNE DETECTION)
        // Nếu vận tốc trục Y lớn hơn 1.5 (đang nhảy lên) hoặc nhỏ hơn -1.5 (đang rơi xuống)
        const isAirborne = Math.abs(targetVel.y) > 1.5; 

        const interceptPos = QuantumMath.predictInstant(player.head_pos, targetVel, selfVel, dist);

        // Trục X và Z luôn được đồng bộ mượt mà
        player.center_of_mass.x = interceptPos.x;
        player.center_of_mass.z = interceptPos.z;
        
        const absoluteCeiling = player.head_pos.y - 0.02; 

        if (isAirborne) {
            // NEO CỨNG KHI ĐANG BAY: Phá vỡ hoàn toàn Center of Mass mặc định.
            // Bất chấp chân tay đối thủ co lên thế nào, mục tiêu Y của đạn chính là đỉnh đầu.
            player.center_of_mass.y = absoluteCeiling; 
        } else {
            // TRẠNG THÁI MẶT ĐẤT: Trượt mềm mại hơn trong khoảng an toàn
            player.center_of_mass.y = QuantumMath.clamp(interceptPos.y, absoluteCeiling - 0.15, absoluteCeiling);
        }

        return isAirborne; // Trả về trạng thái để điều chỉnh Hitbox
    }

    processRecursive(node, context = { selfVel: {x:0, y:0, z:0}, phase: 0 }) {
        if (typeof node !== 'object' || node === null) return node;

        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
                node[i] = this.processRecursive(node[i], context);
            }
            return node;
        }

        if ('player_velocity' in node) context.selfVel = node.player_velocity;
        
        const currentPhase = this.getCombatPhase(node.weapon, node.camera_state);
        if (currentPhase > context.phase) context.phase = currentPhase; 

        if ('weapon' in node) this.enforceZeroPoint(node.weapon);

        if ('players' in node && Array.isArray(node.players)) {
            for (let enemy of node.players) {
                // Lấy trạng thái nhảy từ hàm hijack và truyền vào hàm warp
                const isAirborne = this.hijackCoordinate(enemy, context.selfVel);
                this.warpHitboxes(enemy.hitboxes, enemy.distance || 15.0, context.phase, isAirborne);
            }
        }

        if ('camera_state' in node) {
            node.camera_state.interpolation = "ZERO";
            
            if (context.phase === 1) {
                node.camera_state.vertical_sensitivity_multiplier = 0.0;
                node.camera_state.max_pitch_velocity = 0.0;
            } else if (context.phase === 2) {
                node.camera_state.vertical_sensitivity_multiplier = 0.4;
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
// EXECUTION BLOCK
// ==============================================================================
if (typeof $response !== "undefined" && $response.body) {
    try {
        const payload = JSON.parse($response.body);
        const Engine = new AnchorEquilibriumEngine();
        const mutatedPayload = Engine.processRecursive(payload);
        $done({ body: JSON.stringify(mutatedPayload) });
    } catch (error) {
        $done({ body: $response.body }); 
    }
}
