/**
 * ==============================================================================
 * QUANTUM REACH v76: THE ABSOLUTE OVERLAY (LOS EDITION)
 * Architecture: Coordinate Assignment, Target Stickiness, Ping-Compensated Lead
 * Fixes: Zero "Pulling" delay. The Crosshair IS the Head. Anti-Target-Switching.
 * Status: Omni-Snap Absolute Precision (Clear LOS Only)
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 76) {
    _global.__QuantumState = {
        version: 76,
        frameCounter: 0,
        currentPing: 0.05, // Mặc định 50ms
        lockedTargetId: null, // ID mục tiêu đang bị khóa
        lockedFrames: 0 // Đếm số khung hình đã khóa
    };
}

class QuantumMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    // TÍNH TOÁN VỊ TRÍ ĐẦU Ở TƯƠNG LAI (Bao gồm Ping + Tốc độ đạn + Vận tốc địch)
    static calculateAbsoluteHeadPos(headPos, targetVel, selfVel, distance) {
        const BULLET_SPEED = 99999.0;
        const GRAVITY = -9.81;
        const PING_DELAY = _global.__QuantumState.currentPing;
        
        // Tổng thời gian từ lúc bấm bắn đến khi đạn chạm mục tiêu
        const totalDelay = (distance / BULLET_SPEED) + PING_DELAY + 0.016; // 0.016 = 1 frame delay (60fps)

        return {
            x: headPos.x + (targetVel.x - selfVel.x) * totalDelay,
            y: headPos.y + (targetVel.y - selfVel.y) * totalDelay + 0.5 * GRAVITY * (totalDelay * totalDelay),
            z: headPos.z + (targetVel.z - selfVel.z) * totalDelay
        };
    }
}

class AbsoluteOverlayEngine {
    constructor() {
        this.godWeight = 99999999.0; 
        this.IGNORE_KEYS = new Set([
            'ui', 'inventory', 'audio', 'cosmetics', 'chat', 'minimap', 
            'particles', 'effects', 'vehicle_physics', 'world_lighting'
        ]);

        this.ghostBones = [
            'root', 'spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips', 'neck',
            'left_arm', 'right_arm', 'left_leg', 'right_leg', 'left_thigh', 'right_thigh',
            'left_calf', 'right_calf', 'left_foot', 'right_foot'
        ];
    }

    enforceZeroPoint(weapon) {
        if (!weapon) return;
        ['recoil', 'spread', 'bloom', 'camera_shake', 'weapon_sway'].forEach(p => weapon[p] = 0.0);
        weapon.aim_assist_range = 800.0;      
        weapon.bullet_speed = 99999.0;
        weapon.auto_aim_angle = 120.0; // Thu hẹp góc quét để tránh nhận diện nhầm
    }

    // GÁN CHỈ SỐ HITBOX THAY VÌ HÚT
    assignHitboxOverlay(hitboxes, isFiring, isLockedTarget) {
        if (!hitboxes) return;

        // Tẩy xóa sự tồn tại của cơ thể
        this.ghostBones.forEach(bone => {
            if (hitboxes[bone]) {
                hitboxes[bone].priority = "IGNORE";
                hitboxes[bone].snap_weight = -99999.0;
                hitboxes[bone].m_Radius = 0.000001;
                hitboxes[bone].friction = 0.0;
            }
        });

        if (hitboxes.head) {
            if (isFiring && isLockedTarget) {
                // TRẠNG THÁI GÁN TUYỆT ĐỐI (OVERLAY)
                hitboxes.head.priority = "MAXIMUM";
                hitboxes.head.m_Radius = 80.0; // Phóng to cực đại vùng nhận diện đầu
                
                // Khóa chết Aim Assist vào đây
                hitboxes.head.snap_weight = this.godWeight;
                hitboxes.head.horizontal_magnetism_multiplier = this.godWeight;
                hitboxes.head.vertical_magnetism_multiplier = this.godWeight;
                hitboxes.head.friction = this.godWeight;
            } else {
                // Trạng thái thả lỏng
                hitboxes.head.priority = "NORMAL";
                hitboxes.head.snap_weight = 100.0;
                hitboxes.head.m_Radius = 15.0;
                hitboxes.head.friction = 20.0;
            }
        }
    }

    processRecursive(node, context = { selfVel: {x:0, y:0, z:0}, isFiring: false }) {
        if (typeof node !== 'object' || node === null) return node;
        
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) node[i] = this.processRecursive(node[i], context);
            return node;
        }

        if (node.ping !== undefined) _global.__QuantumState.currentPing = node.ping / 1000.0;
        if (node.player_velocity) context.selfVel = node.player_velocity;
        
        if (node.weapon || node.camera_state) {
            context.isFiring = !!(node.weapon?.is_firing || node.weapon?.recoil_accumulation > 0 || node.camera_state?.is_firing);
            this.enforceZeroPoint(node.weapon);
        }

        if (node.players && Array.isArray(node.players)) {
            // LỌC KẺ ĐỊCH (TARGET STICKINESS LOGIC)
            let validTargets = node.players.filter(p => p.is_visible !== false && p.occluded !== true);
            
            // Xử lý mất mục tiêu
            if (!context.isFiring || validTargets.length === 0) {
                _global.__QuantumState.lockedTargetId = null;
                _global.__QuantumState.lockedFrames = 0;
            } else {
                _global.__QuantumState.lockedFrames++;
            }

            node.players.forEach(enemy => {
                if (!enemy || typeof enemy !== 'object') return;
                
                const enemyId = enemy.id || enemy.uid || 'unknown';
                const isVisible = (enemy.is_visible !== false && enemy.occluded !== true);
                
                // Thuật toán chọn mục tiêu
                let isLockedTarget = false;
                if (isVisible && context.isFiring) {
                    if (_global.__QuantumState.lockedTargetId === null) {
                        // Nếu chưa khóa ai, khóa người đang bị duyệt đầu tiên (có thể tối ưu tìm người gần tâm nhất)
                        _global.__QuantumState.lockedTargetId = enemyId;
                        isLockedTarget = true;
                    } else if (_global.__QuantumState.lockedTargetId === enemyId) {
                        // Đang khóa đúng mục tiêu này
                        isLockedTarget = true;
                    }
                }

                // TIẾN HÀNH "GÁN" (ASSIGNMENT)
                if (isLockedTarget && enemy.head_pos && enemy.center_of_mass) {
                    // 1. Tính toán tọa độ đầu ở Tương lai
                    const absoluteHeadFuture = QuantumMath.calculateAbsoluteHeadPos(
                        enemy.head_pos, 
                        enemy.velocity || {x:0, y:0, z:0}, 
                        context.selfVel, 
                        enemy.distance || 20.0
                    );

                    // 2. GÁN TRỌNG TÂM = ĐỈNH ĐẦU
                    // Máy chủ Aim Assist tự động coi trọng tâm (Center of Mass) là điểm phải nhắm vào.
                    // Chúng ta đánh tráo khái niệm này: Trọng tâm bay lên đầu.
                    enemy.center_of_mass.x = absoluteHeadFuture.x;
                    enemy.center_of_mass.z = absoluteHeadFuture.z;
                    enemy.center_of_mass.y = absoluteHeadFuture.y - 0.01; // Trừ hao nhẹ để đạn ghim giữa trán
                }

                this.assignHitboxOverlay(enemy.hitboxes, context.isFiring, isLockedTarget);
            });
        }

        // ĐỒNG BỘ CAMERA VỚI LỆNH GÁN
        if (node.camera_state && context.isFiring) {
            // Không kéo rề rà, khóa cứng nội suy
            node.camera_state.interpolation = "ZERO";
            node.camera_state.interpolation_frames = 0;
            node.camera_state.snap_speed = this.godWeight;
            node.camera_state.lock_bone = "bone_Head";
            node.camera_state.target_bone_id = 8; // ID Xương Đầu
            node.camera_state.max_pitch_velocity = 0.0;
        } else if (node.camera_state && !context.isFiring) {
            node.camera_state.interpolation = "NORMAL";
        }

        for (const key of Object.keys(node)) {
            if (this.IGNORE_KEYS.has(key)) continue;
            const targetKeys = ['center_of_mass', 'head_pos', 'velocity', 'hitboxes', 'weapon', 'camera_state'];
            if (typeof node[key] === 'object' && !targetKeys.includes(key)) {
                node[key] = this.processRecursive(node[key], {...context});
            }
        }
        return node;
    }
}

// EXECUTION BLOCK
if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.includes('"players"') || $response.body.includes('"camera_state"')) {
        try {
            _global.__QuantumState.frameCounter++;
            const payload = JSON.parse($response.body);
            const mutated = new AbsoluteOverlayEngine().processRecursive(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body });
    }
}
