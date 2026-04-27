/**
 * ==============================================================================
 * QUANTUM REACH v66: ABSOLUTE ANCHOR + FRAME-COUNTED PRESSURE RELEASE
 * Architecture: Enhanced Tri-Phase State Machine + Multi-Frame Predictive Anchoring
 * Optimization: Superior Jump-Shot Immunity, Anti-Overshoot Clamp, Zero Y-Axis Failure,
 *               Frame-Level Pressure Release, Velocity Trend Prediction
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

    // CẢI TIẾN V66: Multi-Frame Predictive cho độ chính xác cao hơn, bù quán tính mạnh
    static predictMultiFrame(targetPos, targetVel, selfVel, distance, frameCount = 4) {
        const BULLET_SPEED = 99999.0;
        let pos = { ...targetPos };
        const dt = (distance / BULLET_SPEED) + 0.001;
        for (let i = 0; i < frameCount; i++) {
            pos.x += (targetVel.x - selfVel.x) * dt;
            pos.y += (targetVel.y - selfVel.y) * dt;
            pos.z += (targetVel.z - selfVel.z) * dt;
        }
        return pos;
    }
}

class AnchorEquilibriumEngine {
    constructor() {
        this.godWeight = 999999.0;
        this.voidWeight = -999999.0;
        this.balanceWeight = 180.0; // Tăng nhẹ để phase 2 mạnh mẽ hơn
        
        this.frameCounter = 0;
        this.pressureReleaseThreshold = 7;   // Frame để xả áp lực (có thể tune theo thực chiến)
        this.pressureReleaseDuration = 3;    // Số frame xả

        // Mở rộng ghost bones (thêm spine variants, upper/lower arms, forearms nếu tồn tại trong Free Fire)
        this.ghostBones = [
            'root', 'spine', 'spine1', 'spine2', 'spine3', 'chest', 'pelvis', 'hips', 
            'left_arm', 'right_arm', 'left_leg', 'right_leg', 
            'left_shoulder', 'right_shoulder', 'left_thigh', 'right_thigh', 
            'left_calf', 'right_calf', 'left_foot', 'right_foot', 
            'left_hand', 'right_hand', 'left_forearm', 'right_forearm',
            'left_upperarm', 'right_upperarm'
        ];
    }

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

        if (!isFiring) return 0;       
        if (shotCount <= 2.5) return 1; 
        return 2;                      
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

    // CẢI TIẾN V66: Anti-Overshoot + Velocity Trend
    calculateAirborneTrend(targetVel, previousVelY = 0) {
        const deltaY = targetVel.y - previousVelY;
        return {
            isRising: targetVel.y > 1.8 || (targetVel.y > 0.8 && deltaY > 0.5),
            isFalling: targetVel.y < -1.8 || (targetVel.y < -0.8 && deltaY < -0.5),
            magnitude: Math.abs(targetVel.y)
        };
    }

    warpHitboxes(hitboxes, distance, phase, isAirborne, velTrend) {
        if (!hitboxes) return;

        // Ghost bones mạnh hơn khi airborne
        for (let bone of this.ghostBones) {
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight;
                hitboxes[bone].priority = "IGNORE";
                hitboxes[bone].m_Radius = 0.00001; 
                hitboxes[bone].friction = 0.0; 
                hitboxes[bone].vertical_magnetism_multiplier = isAirborne 
                    ? (this.voidWeight * 3.5) 
                    : this.voidWeight; 
            }
        }

        if (hitboxes.head) {
            hitboxes.head.priority = "MAXIMUM";
            
            // Radius động theo khoảng cách + airborne + velocity magnitude
            let headRadius = distance > 60.0 ? 35.0 : 22.0;
            if (isAirborne) headRadius += 12.0 + (velTrend.magnitude * 2.0);
            hitboxes.head.m_Radius = headRadius;

            // Magnetism cực mạnh khi airborne hoặc phase 0/1
            const baseMagnet = this.godWeight;
            hitboxes.head.horizontal_magnetism_multiplier = baseMagnet * (isAirborne ? 1.6 : 1.0);
            
            if (phase === 0 || phase === 1) {
                hitboxes.head.snap_weight = this.godWeight; 
                hitboxes.head.vertical_magnetism_multiplier = this.godWeight * (isAirborne ? 2.2 : 1.0);
                hitboxes.head.friction = this.godWeight;
            } else if (phase === 2) {
                // Pressure release theo frame
                const releaseActive = (this.frameCounter % this.pressureReleaseThreshold) < this.pressureReleaseDuration;
                const snapFactor = releaseActive ? 0.55 : 1.0;
                
                hitboxes.head.snap_weight = this.balanceWeight * snapFactor; 
                hitboxes.head.vertical_magnetism_multiplier = 55.0 * (isAirborne ? 1.8 : 1.0); 
                hitboxes.head.friction = 95.0;
            }
        }

        if (hitboxes.neck) {
            hitboxes.neck.snap_weight = (phase === 2) ? this.balanceWeight * 0.6 : this.godWeight * 0.85;
            hitboxes.neck.priority = "HIGH";
            hitboxes.neck.vertical_magnetism_multiplier = isAirborne ? 120.0 : 80.0;
        }
    }

    // CẢI TIẾN V66: Multi-Frame Predict + Anti-Overshoot Clamp + Velocity Trend
    hijackCoordinate(player, selfVel, previousVelY = 0) {
        if (!player || !player.head_pos || !player.center_of_mass) return { isAirborne: false, velTrend: {} };

        const dist = player.distance || 15.0;
        const targetVel = player.velocity || { x: 0, y: 0, z: 0 };
        
        const velTrend = this.calculateAirborneTrend(targetVel, previousVelY);
        const isAirborne = Math.abs(targetVel.y) > 1.5 || velTrend.isRising || velTrend.isFalling;

        // Sử dụng Multi-Frame Predict ở mọi phase để giảm sai số vận tốc tương đối
        const interceptPos = QuantumMath.predictMultiFrame(player.head_pos, targetVel, selfVel, dist, 4);

        // X/Z luôn mượt mà
        player.center_of_mass.x = interceptPos.x;
        player.center_of_mass.z = interceptPos.z;
        
        const absoluteCeiling = player.head_pos.y - 0.015; // Siết chặt hơn một chút

        let targetY;
        if (isAirborne) {
            // Neo tuyệt đối vào ceiling khi bay, chống vượt đầu hoàn toàn
            targetY = absoluteCeiling;
            // Anti-overshoot: clamp nhẹ nếu vận tốc Y cực mạnh
            if (velTrend.magnitude > 8.0) {
                targetY = QuantumMath.clamp(targetY, absoluteCeiling - 0.08, absoluteCeiling + 0.03);
            }
        } else {
            // Trên mặt đất: clamp mềm mại hơn
            targetY = QuantumMath.clamp(interceptPos.y, absoluteCeiling - 0.18, absoluteCeiling);
        }

        player.center_of_mass.y = targetY;

        return { isAirborne, velTrend, previousVelY: targetVel.y };
    }

    processRecursive(node, context = { 
        selfVel: {x:0, y:0, z:0}, 
        phase: 0, 
        previousVelY: {} // Track per-player nếu cần, hiện tại đơn giản hóa
    }) {
        if (typeof node !== 'object' || node === null) return node;

        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
                node[i] = this.processRecursive(node[i], context);
            }
            return node;
        }

        if ('player_velocity' in node) context.selfVel = node.player_velocity;
        
        this.frameCounter = (this.frameCounter || 0) + 1;

        const currentPhase = this.getCombatPhase(node.weapon, node.camera_state);
        if (currentPhase > context.phase) context.phase = currentPhase; 

        if ('weapon' in node) this.enforceZeroPoint(node.weapon);

        if ('players' in node && Array.isArray(node.players)) {
            for (let enemy of node.players) {
                const playerId = enemy.id || enemy.player_id || 'default';
                const prevY = context.previousVelY[playerId] || 0;
                
                const { isAirborne, velTrend, previousVelY } = this.hijackCoordinate(enemy, context.selfVel, prevY);
                context.previousVelY[playerId] = previousVelY;

                this.warpHitboxes(enemy.hitboxes, enemy.distance || 15.0, context.phase, isAirborne, velTrend);
            }
        }

        if ('camera_state' in node) {
            node.camera_state.interpolation = "ZERO";
            
            if (context.phase === 1) {
                node.camera_state.vertical_sensitivity_multiplier = 0.0;
                node.camera_state.max_pitch_velocity = 0.0;
            } else if (context.phase === 2) {
                node.camera_state.vertical_sensitivity_multiplier = 0.45; // Tăng nhẹ cho phase xả
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
