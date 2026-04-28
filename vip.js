/**
 * ==============================================================================
 * QUANTUM REACH v79: THE ABSOLUTE OVERRIDE (100% BRUTAL EFFICIENCY)
 * Architecture: Hit-Packet Forging + Input Nullification + Temporal Sync
 * Fixes: Solves Micro-Jitter, Desync Fire Delay, and Absolute Damage Forcing
 * Status: GOD TIER - The Server obeys the Script, not the Engine.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 79) {
    _global.__QuantumState = {
        version: 79,
        frameCounter: 0,
        currentPing: 0.05,
        history: {},
        lockedTargetId: null,
        lockedTargetPos: null,
        fireStartTick: 0 // Ghi nhận thời điểm bắt đầu bóp cò để đồng bộ trễ
    };
}

class OverrideMath {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    // Tính toán Điểm Sát Thương Tuyệt Đối (Absolute Damage Point)
    static getAbsoluteHitPoint(targetId, headPos, targetVel, selfVel, distance, currentTime) {
        const BULLET_SPEED = 99999.0;
        const GRAVITY = -9.81;
        const flightTime = (distance / BULLET_SPEED) + _global.__QuantumState.currentPing;
        
        let accel = { x: 0, y: 0, z: 0 };
        if (_global.__QuantumState.history[targetId]) {
            const prev = _global.__QuantumState.history[targetId];
            let dt = (currentTime - prev.time) / 1000.0; 
            if (dt > 0.01 && dt < 0.2) { 
                accel.x = this.clamp((targetVel.x - prev.vel.x) / dt, -50.0, 50.0);
                accel.y = this.clamp((targetVel.y - prev.vel.y) / dt, -50.0, 50.0);
                accel.z = this.clamp((targetVel.z - prev.vel.z) / dt, -50.0, 50.0);
            }
        }
        _global.__QuantumState.history[targetId] = { vel: { ...targetVel }, time: currentTime };

        // Tọa độ này sẽ được gán thẳng vào gói tin sát thương
        return { 
            x: headPos.x + (targetVel.x - selfVel.x) * flightTime + 0.5 * accel.x * (flightTime * flightTime),
            y: headPos.y + (targetVel.y - selfVel.y) * flightTime + 0.5 * (accel.y + GRAVITY) * (flightTime * flightTime),
            z: headPos.z + (targetVel.z - selfVel.z) * flightTime + 0.5 * accel.z * (flightTime * flightTime)
        };
    }
}

class AbsoluteOverrideEngine {
    constructor() {
        this.IGNORE_KEYS = new Set(['ui', 'inventory', 'audio', 'cosmetics', 'chat', 'minimap', 'particles', 'effects']);
    }

    findBestTarget(players) {
        if (!players || players.length === 0) return null;
        let bestTarget = null;
        let minDistance = 9999.0;

        for (let enemy of players) {
            if (!enemy || enemy.is_visible === false || enemy.occluded === true) continue;
            // Ưu tiên mục tiêu đang bị khóa
            if (_global.__QuantumState.lockedTargetId === enemy.id) return enemy;
            if (enemy.distance < minDistance) {
                minDistance = enemy.distance;
                bestTarget = enemy;
            }
        }
        return bestTarget;
    }

    processRecursive(node, context = { isFiring: false, justStartedFiring: false, selfVel: {x:0,y:0,z:0} }) {
        if (typeof node !== 'object' || node === null) return node;
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) node[i] = this.processRecursive(node[i], context);
            return node;
        }

        const currentTime = Date.now();
        if (node.ping !== undefined) _global.__QuantumState.currentPing = node.ping / 1000.0;
        if (node.player_velocity) context.selfVel = node.player_velocity;

        // 1. NHẬN DIỆN TRẠNG THÁI KHAI HỎA & THAO TÚNG THỜI GIAN (Temporal Sync)
        if (node.weapon || node.camera_state) {
            const wasFiring = _global.__QuantumState.fireStartTick > 0;
            context.isFiring = !!(node.weapon?.is_firing || node.weapon?.recoil_accumulation > 0 || node.camera_state?.is_firing);
            
            if (context.isFiring && !wasFiring) {
                _global.__QuantumState.fireStartTick = currentTime;
                context.justStartedFiring = true;
            } else if (!context.isFiring) {
                _global.__QuantumState.fireStartTick = 0;
                _global.__QuantumState.lockedTargetId = null;
            }
        }

        // Bù trừ trễ 25ms cho Máy chủ cập nhật Camera trước khi nhận đạn
        if (node.client_timestamp && context.justStartedFiring) {
            node.client_timestamp -= 25; // Đánh lừa máy chủ rằng thao tác này diễn ra ở quá khứ
        }

        // 2. TÍNH TOÁN TỌA ĐỘ TUYỆT ĐỐI (Absolute Targeting)
        if (node.players && Array.isArray(node.players)) {
            const bestTarget = this.findBestTarget(node.players);
            
            if (bestTarget && context.isFiring) {
                _global.__QuantumState.lockedTargetId = bestTarget.id;
                
                node.players.forEach(enemy => {
                    if (enemy.id === _global.__QuantumState.lockedTargetId && enemy.head_pos) {
                        _global.__QuantumState.lockedTargetPos = OverrideMath.getAbsoluteHitPoint(
                            enemy.id, enemy.head_pos, enemy.velocity || {x:0, y:0, z:0}, 
                            context.selfVel, enemy.distance || 20.0, currentTime
                        );

                        // Vẫn duy trì hút Camera cực mạnh để làm nền
                        enemy.center_of_mass.x = _global.__QuantumState.lockedTargetPos.x;
                        enemy.center_of_mass.y = _global.__QuantumState.lockedTargetPos.y - 0.01;
                        enemy.center_of_mass.z = _global.__QuantumState.lockedTargetPos.z;

                        if (enemy.hitboxes && enemy.hitboxes.head) {
                            enemy.hitboxes.head.priority = "MAXIMUM";
                            enemy.hitboxes.head.m_Radius = 99.0;
                            enemy.hitboxes.head.snap_weight = 9999999.0;
                        }
                    }
                });
            }
        }

        // 3. LY KHAI CẢM ỨNG (Input Nullification)
        if (node.input_sync || node.player_input) {
            if (context.isFiring) {
                // Đóng băng toàn bộ thao tác vuốt Camera khi bóp cò
                const inputKeys = ['touch_delta_x', 'touch_delta_y', 'swipe_velocity_x', 'swipe_velocity_y', 'camera_pitch_delta', 'camera_yaw_delta'];
                inputKeys.forEach(k => { if (node[k] !== undefined) node[k] = 0.0; });
            }
        }

        if (node.camera_state && context.isFiring && _global.__QuantumState.lockedTargetId) {
            node.camera_state.interpolation = "ZERO";
            node.camera_state.max_pitch_velocity = 0.0;
            node.camera_state.max_yaw_velocity = 0.0;
            node.camera_state.target_bone_id = 8;
        }

        // 4. GIẢ MẠO SÁT THƯƠNG (Hit-Packet Forging)
        // Đây là điểm bóp nghẹt Server: Khi gói tin sát thương được gửi đi, ta ép nó thành Headshot.
        if (node.damage_report || node.hit_event || node.bullet_hit) {
            if (_global.__QuantumState.lockedTargetId && _global.__QuantumState.lockedTargetPos) {
                // Ép ID mục tiêu
                node.target_id = _global.__QuantumState.lockedTargetId;
                
                // Ép xương bị trúng (8 = Head)
                if (node.hit_bone !== undefined) node.hit_bone = 8;
                if (node.part_id !== undefined) node.part_id = "head";
                
                // Ép sát thương chí mạng
                if (node.is_critical !== undefined) node.is_critical = true;
                if (node.is_headshot !== undefined) node.is_headshot = true;
                
                // Gán tọa độ điểm trúng bằng đúng tọa độ dự đoán Động học
                if (node.hit_pos) {
                    node.hit_pos.x = _global.__QuantumState.lockedTargetPos.x;
                    node.hit_pos.y = _global.__QuantumState.lockedTargetPos.y;
                    node.hit_pos.z = _global.__QuantumState.lockedTargetPos.z;
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

if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.includes('"players"') || $response.body.includes('"camera_state"') || $response.body.includes('"hit_bone"')) {
        try {
            _global.__QuantumState.frameCounter++;
            const payload = JSON.parse($response.body);
            const mutated = new AbsoluteOverrideEngine().processRecursive(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
