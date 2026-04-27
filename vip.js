/**
 * ==============================================================================
 * QUANTUM REACH v67: THE OMNI-STATE ARCHITECTURE
 * Architecture: Global Persistence + Dynamic Multi-Frame + Short-Circuit Parser
 * Optimization: Zero CPU Bottleneck, Distance-Aware Prediction, Flawless Jump-Tracking
 * ==============================================================================
 */

// 1. KHỞI TẠO BỘ NHỚ TOÀN CỤC (STATE PERSISTENCE)
// Giúp Shadowrocket không bị "mất trí nhớ" giữa các lần đọc gói tin liên tiếp
const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState) {
    _global.__QuantumState = {
        frameCounter: 0,
        previousVelY: {},
        lastFireRate: 0.1
    };
}

class QuantumMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    // CẢI TIẾN: Số khung hình dự đoán tỷ lệ thuận với khoảng cách
    static getDynamicFrames(distance) {
        // Khoảng cách < 15m: 1 frame (Tránh vẩy tâm quá lố ở tầm gần)
        // Khoảng cách > 60m: 5 frames (Đón đầu hoàn hảo ở tầm xa)
        return Math.max(1, Math.min(5, Math.round(distance / 15.0)));
    }

    static predictMultiFrame(targetPos, targetVel, selfVel, distance) {
        const frames = this.getDynamicFrames(distance);
        const BULLET_SPEED = 99999.0;
        let pos = { ...targetPos };
        const dt = (distance / BULLET_SPEED) + 0.001;
        
        for (let i = 0; i < frames; i++) {
            pos.x += (targetVel.x - selfVel.x) * dt;
            pos.y += (targetVel.y - selfVel.y) * dt;
            pos.z += (targetVel.z - selfVel.z) * dt;
        }
        return pos;
    }
}

class OmniStateEngine {
    constructor() {
        this.godWeight = 999999.0;
        this.voidWeight = -999999.0;
        this.balanceWeight = 180.0; 
        
        // Danh sách các Key dữ liệu rác cần bỏ qua để tối ưu CPU (Short-Circuit)
        this.IGNORE_KEYS = new Set([
            'ui', 'inventory', 'audio', 'cosmetics', 'friends_list', 
            'graphics_settings', 'match_stats', 'chat'
        ]);

        this.ghostBones = [
            'root', 'spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips', 
            'left_arm', 'right_arm', 'left_leg', 'right_leg', 
            'left_shoulder', 'right_shoulder', 'left_thigh', 'right_thigh', 
            'left_calf', 'right_calf', 'left_foot', 'right_foot', 'left_hand', 'right_hand'
        ];
    }

    getCombatPhase(weapon, camera) {
        let isFiring = false;
        let shotCount = 0;

        if (weapon) {
            if (weapon.is_firing || weapon.recoil_accumulation > 0) isFiring = true;
            if (weapon.shots_fired !== undefined) shotCount = weapon.shots_fired;
            else if (weapon.recoil_accumulation !== undefined) shotCount = weapon.recoil_accumulation / 0.02;
            
            // Cập nhật Fire Rate vào Global State nếu có
            if (weapon.fire_rate) _global.__QuantumState.lastFireRate = weapon.fire_rate;
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

        for (let bone of this.ghostBones) {
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight;
                hitboxes[bone].priority = "IGNORE";
                hitboxes[bone].m_Radius = 0.00001; 
                hitboxes[bone].friction = 0.0; 
                hitboxes[bone].vertical_magnetism_multiplier = isAirborne ? (this.voidWeight * 3.5) : this.voidWeight; 
            }
        }

        if (hitboxes.head) {
            hitboxes.head.priority = "MAXIMUM";
            
            let headRadius = distance > 60.0 ? 35.0 : 22.0;
            if (isAirborne) headRadius += 12.0 + (velTrend.magnitude * 2.0);
            hitboxes.head.m_Radius = headRadius;

            hitboxes.head.horizontal_magnetism_multiplier = this.godWeight * (isAirborne ? 1.6 : 1.0);
            
            if (phase === 0 || phase === 1) {
                hitboxes.head.snap_weight = this.godWeight; 
                hitboxes.head.vertical_magnetism_multiplier = this.godWeight * (isAirborne ? 2.2 : 1.0);
                hitboxes.head.friction = this.godWeight;
            } else if (phase === 2) {
                // CẢI TIẾN: Xả áp đồng bộ theo Fire Rate (hoặc nhịp đếm an toàn)
                const releaseCycle = Math.max(3, Math.round(1.0 / _global.__QuantumState.lastFireRate));
                const isReleasing = (_global.__QuantumState.frameCounter % releaseCycle) < (releaseCycle / 2);
                
                const snapFactor = isReleasing ? 0.55 : 1.0;
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

    hijackCoordinate(player, selfVel, previousVelY = 0) {
        if (!player || !player.head_pos || !player.center_of_mass) return { isAirborne: false, velTrend: {}, prevY: 0 };

        const dist = player.distance || 15.0;
        const targetVel = player.velocity || { x: 0, y: 0, z: 0 };
        
        const velTrend = this.calculateAirborneTrend(targetVel, previousVelY);
        const isAirborne = Math.abs(targetVel.y) > 1.5 || velTrend.isRising || velTrend.isFalling;

        const interceptPos = QuantumMath.predictMultiFrame(player.head_pos, targetVel, selfVel, dist);

        player.center_of_mass.x = interceptPos.x;
        player.center_of_mass.z = interceptPos.z;
        
        const absoluteCeiling = player.head_pos.y - 0.015; 

        if (isAirborne) {
            player.center_of_mass.y = absoluteCeiling;
            if (velTrend.magnitude > 8.0) {
                player.center_of_mass.y = QuantumMath.clamp(absoluteCeiling, absoluteCeiling - 0.08, absoluteCeiling + 0.03);
            }
        } else {
            player.center_of_mass.y = QuantumMath.clamp(interceptPos.y, absoluteCeiling - 0.18, absoluteCeiling);
        }

        return { isAirborne, velTrend, prevY: targetVel.y };
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
        
        // Tăng biến đếm toàn cục
        _global.__QuantumState.frameCounter++;

        const currentPhase = this.getCombatPhase(node.weapon, node.camera_state);
        if (currentPhase > context.phase) context.phase = currentPhase; 

        if ('weapon' in node) this.enforceZeroPoint(node.weapon);

        if ('players' in node && Array.isArray(node.players)) {
            for (let enemy of node.players) {
                const playerId = enemy.id || enemy.player_id || 'default_target';
                const lastY = _global.__QuantumState.previousVelY[playerId] || 0;
                
                const { isAirborne, velTrend, prevY } = this.hijackCoordinate(enemy, context.selfVel, lastY);
                
                // Lưu lại vận tốc Y vào vùng nhớ toàn cục
                _global.__QuantumState.previousVelY[playerId] = prevY;

                this.warpHitboxes(enemy.hitboxes, enemy.distance || 15.0, context.phase, isAirborne, velTrend);
            }
        }

        if ('camera_state' in node) {
            node.camera_state.interpolation = "ZERO";
            if (context.phase === 1) {
                node.camera_state.vertical_sensitivity_multiplier = 0.0;
                node.camera_state.max_pitch_velocity = 0.0;
            } else if (context.phase === 2) {
                node.camera_state.vertical_sensitivity_multiplier = 0.45; 
            }
        }

        // CẢI TIẾN: Ngắt sớm (Short-Circuit) để giảm tải CPU
        for (const key of Object.keys(node)) {
            if (this.IGNORE_KEYS.has(key)) continue; // Bỏ qua dữ liệu rác
            
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
        const Engine = new OmniStateEngine();
        const mutatedPayload = Engine.processRecursive(payload);
        $done({ body: JSON.stringify(mutatedPayload) });
    } catch (error) {
        $done({ body: $response.body }); 
    }
}
