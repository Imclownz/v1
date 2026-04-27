/**
 * ==============================================================================
 * QUANTUM REACH v77: FRONT-FOCUSED ABSOLUTE ASSIGNMENT
 * Architecture: Direct Euler Angle Forcing + Target Stickiness + Ping Buffer
 * Optimization: 180-Degree Frontal FOV Scan (CPU & Target Selection Optimization)
 * Fixes: No Rear-Snapping, Absolute Zero-Frame Snap, Stable Target Locking
 * Status: GOD MODE - DIRECT CAMERA HIJACKING (FRONTAL ONLY)
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 77) {
    _global.__QuantumState = {
        version: 77,
        frameCounter: 0,
        lockedTargetId: null,      
        lockFrames: 0,             
        currentPing: 0.05
    };
}

class QuantumMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    static predictAbsolute(headPos, targetVel, selfVel, distance) {
        const BULLET_SPEED = 99999.0;
        const GRAVITY = -9.81;
        
        const flightTime = (distance / BULLET_SPEED) + _global.__QuantumState.currentPing + 0.001;
        
        return {
            x: headPos.x + (targetVel.x - selfVel.x) * flightTime,
            y: headPos.y + (targetVel.y - selfVel.y) * flightTime + 0.5 * GRAVITY * (flightTime * flightTime) - 0.015,
            z: headPos.z + (targetVel.z - selfVel.z) * flightTime
        };
    }
}

class FrontFocusedAssignmentEngine {
    constructor() {
        this.IGNORE_KEYS = new Set([
            'ui', 'inventory', 'audio', 'cosmetics', 'chat', 'minimap', 
            'particles', 'effects', 'vehicle_physics', 'world_lighting'
        ]);
        
        this.ghostBones = [
            'root', 'spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips', 
            'left_arm', 'right_arm', 'left_leg', 'right_leg', 'left_thigh', 'right_thigh',
            'left_calf', 'right_calf', 'left_foot', 'right_foot', 'neck'
        ];
    }

    findBestTarget(players) {
        if (!players || players.length === 0) return null;
        
        let bestTarget = null;
        let minDistance = 9999.0;

        for (let enemy of players) {
            if (!enemy || enemy.is_visible === false || enemy.occluded === true) continue;

            if (_global.__QuantumState.lockedTargetId === enemy.id && _global.__QuantumState.lockFrames < 30) {
                return enemy;
            }

            if (enemy.distance < minDistance) {
                minDistance = enemy.distance;
                bestTarget = enemy;
            }
        }
        return bestTarget;
    }

    nullifyWeaponAssist(weapon) {
        if (!weapon) return;
        
        // Loại bỏ các thuộc tính gây nhiễu
        const nullifyProps = ['recoil', 'spread', 'bloom', 'camera_shake', 'weapon_sway'];
        for (let prop of nullifyProps) weapon[prop] = 0.0;
        
        weapon.aim_assist_range = 800.0;
        
        // CẢI TIẾN TẠI ĐÂY: Giới hạn FOV xuống 180 độ. 
        // Engine sẽ tự động bỏ qua toàn bộ mục tiêu nằm ở nửa bán cầu phía sau lưng nhân vật.
        weapon.auto_aim_angle = 180.0; 
        
        weapon.bullet_speed = 99999.0;
    }

    processRecursive(node, context = { isFiring: false, selfVel: {x:0,y:0,z:0}, targetId: null, targetPos: null }) {
        if (typeof node !== 'object' || node === null) return node;
        
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) node[i] = this.processRecursive(node[i], context);
            return node;
        }

        if (node.ping !== undefined) _global.__QuantumState.currentPing = node.ping / 1000.0;
        if (node.player_velocity) context.selfVel = node.player_velocity;

        if (node.weapon || node.camera_state) {
            context.isFiring = !!(node.weapon?.is_firing || node.weapon?.recoil_accumulation > 0 || node.camera_state?.is_firing);
            if (node.weapon) this.nullifyWeaponAssist(node.weapon);
        }

        if (node.players && Array.isArray(node.players)) {
            const bestTarget = this.findBestTarget(node.players);
            
            if (bestTarget && context.isFiring) {
                if (_global.__QuantumState.lockedTargetId !== bestTarget.id) {
                    _global.__QuantumState.lockedTargetId = bestTarget.id;
                    _global.__QuantumState.lockFrames = 0;
                } else {
                    _global.__QuantumState.lockFrames++;
                }

                context.targetId = bestTarget.id;

                node.players.forEach(enemy => {
                    this.ghostBones.forEach(bone => {
                        if (enemy.hitboxes && enemy.hitboxes[bone]) {
                            enemy.hitboxes[bone].priority = "IGNORE";
                            enemy.hitboxes[bone].snap_weight = -999999.0;
                            enemy.hitboxes[bone].m_Radius = 0.0;
                        }
                    });

                    if (enemy.id === context.targetId && enemy.head_pos) {
                        const interceptPos = QuantumMath.predictAbsolute(
                            enemy.head_pos, 
                            enemy.velocity || {x:0, y:0, z:0}, 
                            context.selfVel, 
                            enemy.distance || 20.0
                        );
                        
                        context.targetPos = interceptPos;

                        enemy.center_of_mass.x = interceptPos.x;
                        enemy.center_of_mass.y = interceptPos.y;
                        enemy.center_of_mass.z = interceptPos.z;

                        if (enemy.hitboxes && enemy.hitboxes.head) {
                            enemy.hitboxes.head.priority = "ABSOLUTE";
                            enemy.hitboxes.head.m_Radius = 999.0; 
                        }
                    }
                });
            } else {
                _global.__QuantumState.lockedTargetId = null;
                _global.__QuantumState.lockFrames = 0;
            }
        }

        if (node.camera_state) {
            if (context.isFiring && context.targetId && context.targetPos) {
                node.camera_state.forced_target_id = context.targetId; 
                node.camera_state.absolute_lock = true;
                node.camera_state.lock_bone = "bone_Head";
                node.camera_state.target_bone_id = 8;
                
                node.camera_state.interpolation = "ZERO";
                node.camera_state.interpolation_frames = 0;
                node.camera_state.max_pitch_velocity = 0.0;
                node.camera_state.max_yaw_velocity = 0.0;
                
                node.camera_state.target_x = context.targetPos.x;
                node.camera_state.target_y = context.targetPos.y;
                node.camera_state.target_z = context.targetPos.z;
                
            } else {
                node.camera_state.absolute_lock = false;
                node.camera_state.forced_target_id = null;
                node.camera_state.interpolation = "NORMAL";
            }
        }

        for (const key of Object.keys(node)) {
            if (this.IGNORE_KEYS.has(key)) continue;
            if (typeof node[key] === 'object' && !['center_of_mass', 'head_pos', 'velocity', 'hitboxes', 'weapon', 'camera_state', 'players'].includes(key)) {
                node[key] = this.processRecursive(node[key], {...context});
            }
        }
        return node;
    }
}

if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.includes('"players"') || $response.body.includes('"camera_state"')) {
        try {
            _global.__QuantumState.frameCounter++;
            const payload = JSON.parse($response.body);
            const mutated = new FrontFocusedAssignmentEngine().processRecursive(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
