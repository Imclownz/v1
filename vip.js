/**
 * ==============================================================================
 * QUANTUM REACH v82: THE RELATIVE TRUTH (SERVER-COMPLIANT BRUTALITY)
 * Architecture: Inverse Recoil Forcing + Stance Spoofing + Relative Kinematics
 * Fixes: Bypasses Server-Side Spread Validation and In-Air Penalties
 * Status: ARCHITECT LEVEL - Turning the Server's logic against itself.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 82) {
    _global.__QuantumState = {
        version: 82,
        frameCounter: 0,
        currentPing: 50.0,
        lockedTargetId: null,
        perfectPitch: 0.0,
        perfectYaw: 0.0,
        currentRecoilY: 0.0, // Độ giật trục dọc (Pitch)
        currentRecoilX: 0.0  // Độ giật trục ngang (Yaw)
    };
}

class RelativeMath {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    static calculateAngles(fromPos, toPos) {
        if (!fromPos || !toPos) return { pitch: 0, yaw: 0 };
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const dz = toPos.z - fromPos.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz);
        
        const yaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
        const pitch = Math.atan2(-dy, distXZ) * (180.0 / Math.PI);
        return { pitch, yaw };
    }

    // ĐỘNG HỌC TƯƠNG ĐỐI: Dùng Vector Tương đối (V_relative) thay vì V_enemy
    static getRelativeHitPoint(headPos, targetVel, selfVel, distance) {
        const BULLET_SPEED = 99999.0;
        const GRAVITY = -9.81;
        const flightTime = (distance / BULLET_SPEED) + (_global.__QuantumState.currentPing / 1000.0);
        
        // V_relative = V_enemy - V_self
        const relVx = targetVel.x - selfVel.x;
        const relVy = targetVel.y - selfVel.y;
        const relVz = targetVel.z - selfVel.z;

        return { 
            x: headPos.x + (relVx * flightTime),
            y: headPos.y + (relVy * flightTime) + 0.5 * GRAVITY * (flightTime * flightTime),
            z: headPos.z + (relVz * flightTime)
        };
    }
}

class TheRelativeTruthEngine {
    constructor() {
        this.IGNORE_KEYS = new Set(['ui', 'telemetry', 'metrics', 'log', 'audio', 'cosmetics', 'chat']);
    }

    processRecursive(node, context = { isFiring: false, selfPos: null, selfVel: {x:0,y:0,z:0} }) {
        if (typeof node !== 'object' || node === null) return node;

        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) node[i] = this.processRecursive(node[i], context);
            return node;
        }

        if (node.ping !== undefined) _global.__QuantumState.currentPing = node.ping;
        if (node.player_pos) context.selfPos = node.player_pos;
        
        // Ghi nhận vận tốc thật của bản thân để tính Động học tương đối
        if (node.player_velocity) context.selfVel = node.player_velocity;

        // 1. STANCE SPOOFING (Giả mạo Tư thế)
        // Máy chủ thấy bạn có Vận tốc > 0 nhưng Tư thế lại là Ngồi (Khớp với quy luật chống giật)
        if (node.is_crouching !== undefined) node.is_crouching = true;
        if (node.pose_id !== undefined) node.pose_id = 1; // 1 thường là Crouch
        if (node.in_air !== undefined) node.in_air = false;
        if (node.is_jumping !== undefined) node.is_jumping = false;

        // 2. TRÍCH XUẤT ĐỘ GIẬT ĐỘNG (Dynamic Recoil Extraction)
        if (node.weapon) {
            context.isFiring = !!(node.weapon.is_firing || node.weapon.recoil_accumulation > 0);
            if (context.isFiring) {
                // Không ép về 0 nữa. Thu thập nó để làm toán nghịch đảo!
                _global.__QuantumState.currentRecoilY = node.weapon.recoil_y || (node.weapon.recoil_accumulation * 0.8) || 0;
                _global.__QuantumState.currentRecoilX = node.weapon.recoil_x || (node.weapon.spread * 0.5) || 0;
            }
        }
        if (node.camera_state) {
            context.isFiring = context.isFiring || !!node.camera_state.is_firing;
        }

        // 3. TÍNH TOÁN VECTOR TƯƠNG ĐỐI
        if (node.players && Array.isArray(node.players) && context.isFiring) {
            let bestTarget = null;
            let minDistance = 9999.0;

            node.players.forEach(enemy => {
                if (enemy.is_visible !== false && enemy.occluded !== true) {
                    if (enemy.distance < minDistance) { minDistance = enemy.distance; bestTarget = enemy; }
                }
            });

            if (bestTarget && bestTarget.head_pos) {
                _global.__QuantumState.lockedTargetId = bestTarget.id;
                
                // Trả về tọa độ điểm trúng đã được bù trừ vận tốc của chính bạn
                const hitPoint = RelativeMath.getRelativeHitPoint(
                    bestTarget.head_pos, bestTarget.velocity || {x:0,y:0,z:0}, 
                    context.selfVel, bestTarget.distance || 20.0
                );

                if (context.selfPos) {
                    const angles = RelativeMath.calculateAngles(context.selfPos, hitPoint);
                    _global.__QuantumState.perfectPitch = angles.pitch;
                    _global.__QuantumState.perfectYaw = angles.yaw;
                }
            }
        }

        // 4. BÙ TRỪ NGHỊCH ĐẢO VÀ GIẢ MẠO SÁT THƯƠNG (Inverse Recoil Forcing)
        if (node.damage_report || node.hit_event || node.bullet_hit || node.fire_event) {
            if (_global.__QuantumState.lockedTargetId) {
                node.target_id = _global.__QuantumState.lockedTargetId;
                if (node.hit_bone !== undefined) node.hit_bone = 8;
                if (node.is_headshot !== undefined) node.is_headshot = true;

                // CÔNG THỨC NGHỊCH ĐẢO: Góc gửi đi = Góc hoàn hảo - Độ giật
                // Khi Máy chủ cộng độ giật vào, nó sẽ trở lại thành Góc hoàn hảo.
                const inversePitch = _global.__QuantumState.perfectPitch - _global.__QuantumState.currentRecoilY;
                const inverseYaw = _global.__QuantumState.perfectYaw - _global.__QuantumState.currentRecoilX;

                // Ghi đè vào gói tin
                if (node.camera_pitch !== undefined) node.camera_pitch = inversePitch;
                if (node.camera_yaw !== undefined) node.camera_yaw = inverseYaw;
                if (node.aim_pitch !== undefined) node.aim_pitch = inversePitch;
                if (node.aim_yaw !== undefined) node.aim_yaw = inverseYaw;
                
                // Đồng bộ thời gian nhẹ nhàng, không gây Negative Delta Time
                if (node.client_timestamp !== undefined) {
                    node.client_timestamp -= (_global.__QuantumState.currentPing * 0.2); 
                }
            }
        }

        for (const key of Object.keys(node)) {
            if (this.IGNORE_KEYS.has(key)) continue;
            if (typeof node[key] === 'object') {
                node[key] = this.processRecursive(node[key], {...context});
            }
        }
        return node;
    }
}

// EXECUTION BLOCK
if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.includes('"players"') || $response.body.includes('"camera_state"') || $response.body.includes('"hit_bone"') || $response.body.includes('"weapon"')) {
        try {
            _global.__QuantumState.frameCounter++;
            const payload = JSON.parse($response.body);
            const mutated = new TheRelativeTruthEngine().processRecursive(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
