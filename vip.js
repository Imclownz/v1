/**
 * ==============================================================================
 * QUANTUM REACH v92: ABSOLUTE MAGNETO (NO-LIMIT SYNERGY)
 * Architecture: Magnetism Erasure + Chest-to-Head Override + Telescopic 10m
 * Fixes: Solves Crosshair Stickiness, Angular Snap Rejection, and Recoil Misses.
 * Status: GOD TIER - The ultimate brute-force execution.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 92) {
    _global.__QuantumState = {
        version: 92,
        lastPacketTime: 0,     
        startupPackets: 0,     
        currentMatchId: null,
        fireSequence: 0,       
        currentPing: 50.0,
        history: {},
        target: { id: null, pos: null, distance: 999.0 },
        vector: { pitch: 0.0, yaw: 0.0 }, 
        weapon: { isFiring: false, type: "HITSCAN", speed: 99999.0, recoilY: 0, spreadX: 0 },
        self: { pos: {x:0, y:0, z:0}, vel: {x:0, y:0, z:0}, chronosAnchor: null }
    };
}

class MagnetoMath {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    static calculateAbsoluteLead(targetId, headPos, targetVel, distance, currentTime) {
        const pingDelay = _global.__QuantumState.currentPing / 1000.0;
        let flightTime = pingDelay;
        let dropY = 0;

        if (_global.__QuantumState.weapon.type === "PROJECTILE") {
            const GRAVITY = -9.81;
            flightTime += (distance / _global.__QuantumState.weapon.speed);
            dropY = 0.5 * GRAVITY * (flightTime * flightTime);
        }
        
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

        let predictedY = headPos.y;
        if (targetVel.y < 0) {
            predictedY += targetVel.y * flightTime + 0.5 * accel.y * (flightTime * flightTime);
        }
        // Hạ điểm ngắm xuống 15cm (vào yết hầu) để Server tự động giật lên sọ
        predictedY -= 0.15; 
        predictedY -= dropY;

        return { 
            x: headPos.x + targetVel.x * flightTime + 0.5 * accel.x * (flightTime * flightTime),
            y: predictedY,
            z: headPos.z + targetVel.z * flightTime + 0.5 * accel.z * (flightTime * flightTime)
        };
    }

    static generateInverseVector(fromPos, toPos, recoilY, spreadX) {
        if (!fromPos || !toPos) return { pitch: 0, yaw: 0 };
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const dz = toPos.z - fromPos.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz);
        
        let yaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
        let pitch = Math.atan2(-dy, distXZ) * (180.0 / Math.PI);

        pitch -= recoilY; 
        yaw -= spreadX;   

        return { pitch, yaw };
    }
}

class AbsoluteMagnetoEngine {
    cleanseMemory() {
        _global.__QuantumState.history = {};
        _global.__QuantumState.fireSequence = 0;
        _global.__QuantumState.startupPackets = 0;
        _global.__QuantumState.self.chronosAnchor = null;
        _global.__QuantumState.target = { id: null, pos: null, distance: 999.0 };
    }

    processFastPath(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        if (Array.isArray(payload)) {
            for (let i = 0; i < payload.length; i++) payload[i] = this.processFastPath(payload[i]);
            return payload;
        }

        const currentTime = Date.now();

        // TIME-DELTA HARD RESET
        if (_global.__QuantumState.lastPacketTime > 0 && (currentTime - _global.__QuantumState.lastPacketTime) > 5000) {
            this.cleanseMemory(); 
        }
        _global.__QuantumState.lastPacketTime = currentTime;

        // DYNAMIC PING SYNC
        if (payload.ping !== undefined) {
            if (_global.__QuantumState.startupPackets < 3) {
                _global.__QuantumState.currentPing = payload.ping; 
                _global.__QuantumState.startupPackets++;
            } else {
                _global.__QuantumState.currentPing = (_global.__QuantumState.currentPing * 0.7) + (payload.ping * 0.3); 
            }
        }

        if (payload.match_id !== undefined && payload.match_id !== _global.__QuantumState.currentMatchId) {
            _global.__QuantumState.currentMatchId = payload.match_id;
            this.cleanseMemory();
        }

        // CHRONOS ANCHOR
        if (payload.player_pos) {
            _global.__QuantumState.self.pos = payload.player_pos;
            if (!_global.__QuantumState.weapon.isFiring) {
                _global.__QuantumState.self.chronosAnchor = { ...payload.player_pos };
            }
        }
        if (payload.player_velocity) _global.__QuantumState.self.vel = payload.player_velocity;

        // WEAPON MATRIX
        _global.__QuantumState.weapon.isFiring = false;
        if (payload.weapon) {
            _global.__QuantumState.weapon.isFiring = !!(payload.weapon.is_firing || payload.weapon.recoil_accumulation > 0);
            if (payload.weapon.category === "SNIPER" || payload.weapon.id === "AWM" || payload.weapon.id === "KAR98K") {
                _global.__QuantumState.weapon.type = "PROJECTILE";
                _global.__QuantumState.weapon.speed = payload.weapon.bullet_speed || 800.0;
            } else {
                _global.__QuantumState.weapon.type = "HITSCAN";
            }
            if (_global.__QuantumState.weapon.isFiring) {
                _global.__QuantumState.weapon.recoilY = payload.weapon.recoil_accumulation !== undefined ? payload.weapon.recoil_accumulation : 0.05;
                _global.__QuantumState.weapon.spreadX = payload.weapon.progressive_spread !== undefined ? payload.weapon.progressive_spread : 0.02;
            }
        }

        // TÌM MỤC TIÊU VÀ THAO TÚNG TỪ TÍNH (GIẢI PHÁP 2)
        if (payload.players && Array.isArray(payload.players)) {
            let bestTarget = null;
            let minDistance = 9999.0;

            for (let i = 0; i < payload.players.length; i++) {
                const enemy = payload.players[i];
                if (enemy.is_visible !== false && enemy.occluded !== true) {
                    
                    if (enemy.hitboxes) {
                        // 1. Xóa bỏ hoàn toàn lực hút của cơ thể
                        const bodyParts = ['chest', 'spine', 'pelvis', 'left_arm', 'right_arm', 'left_leg', 'right_leg', 'neck'];
                        bodyParts.forEach(part => {
                            if (enemy.hitboxes[part]) {
                                enemy.hitboxes[part].priority = "IGNORE";
                                enemy.hitboxes[part].friction = 0.0;
                                enemy.hitboxes[part].magnetism = 0.0; // Triệt tiêu từ tính ngực/bụng
                            }
                        });

                        // 2. Ép lực hút cực đại vào đầu
                        if (enemy.hitboxes['head']) {
                            enemy.hitboxes['head'].priority = "ABSOLUTE";
                            enemy.hitboxes['head'].magnetism = 999.0; // Biến đầu thành nam châm vĩnh cửu
                            enemy.hitboxes['head'].friction = 99.0;
                        }
                    }

                    if (enemy.distance < minDistance) { 
                        minDistance = enemy.distance; 
                        bestTarget = enemy; 
                    }
                }
            }

            if (bestTarget && bestTarget.head_pos && _global.__QuantumState.weapon.isFiring) {
                _global.__QuantumState.target.id = bestTarget.id;
                _global.__QuantumState.target.distance = minDistance;
                
                _global.__QuantumState.target.pos = MagnetoMath.calculateAbsoluteLead(
                    bestTarget.id, bestTarget.head_pos, bestTarget.velocity || {x:0,y:0,z:0}, 
                    minDistance, currentTime
                );

                const activeOrigin = _global.__QuantumState.self.chronosAnchor || _global.__QuantumState.self.pos;
                
                const masterVector = MagnetoMath.generateInverseVector(
                    activeOrigin, 
                    _global.__QuantumState.target.pos,
                    _global.__QuantumState.weapon.recoilY,
                    _global.__QuantumState.weapon.spreadX
                );
                
                _global.__QuantumState.vector.pitch = masterVector.pitch;
                _global.__QuantumState.vector.yaw = masterVector.yaw;

                // Để Client tự hút lên đầu nhờ từ tính đã được chỉnh sửa (Không ép cứng Camera gây lỗi)
                if (payload.camera_state) {
                    payload.camera_state.target_x = _global.__QuantumState.target.pos.x;
                    payload.camera_state.target_y = _global.__QuantumState.target.pos.y;
                    payload.camera_state.target_z = _global.__QuantumState.target.pos.z;
                    payload.camera_state.interpolation = "SMOOTH"; // Kéo mượt, chống giật gắt
                }
            }
        }

        // GIAO THOA NGỰC - SỌ VÀ DỊCH CHUYỂN NÒNG SÚNG (GIẢI PHÁP 3)
        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            if (_global.__QuantumState.target.id && _global.__QuantumState.target.pos) {
                
                // Cưỡng chế mọi sát thương đều là Headshot dù Client báo bắn trúng đâu
                payload.target_id = _global.__QuantumState.target.id;
                payload.hit_bone = 8; // Ép vào Đỉnh Sọ
                payload.is_headshot = true; // Ép cờ Headshot
                if (payload.ignore_armor !== undefined) payload.ignore_armor = true;
                
                // Kéo nòng súng vật lý lên sát mặt địch (Tối đa 10m)
                if (payload.fire_origin !== undefined) {
                    const maxSpoof = 10.0;
                    const safetyMargin = 0.5;
                    const spoofDistance = Math.min(_global.__QuantumState.target.distance - safetyMargin, maxSpoof);
                    
                    if (spoofDistance > 0) {
                        const activeOrigin = _global.__QuantumState.self.chronosAnchor || _global.__QuantumState.self.pos;
                        const targetPos = _global.__QuantumState.target.pos; 
                        const ratio = spoofDistance / _global.__QuantumState.target.distance;
                        
                        payload.fire_origin.x = activeOrigin.x + (targetPos.x - activeOrigin.x) * ratio;
                        payload.fire_origin.y = activeOrigin.y + (targetPos.y - activeOrigin.y) * ratio;
                        payload.fire_origin.z = activeOrigin.z + (targetPos.z - activeOrigin.z) * ratio;
                    }
                }

                if (payload.attacker_pos !== undefined && _global.__QuantumState.self.chronosAnchor) {
                    payload.attacker_pos = { ..._global.__QuantumState.self.chronosAnchor };
                }

                // Dời điểm chạm thực tế lên Sọ
                if (payload.hit_pos) {
                    payload.hit_pos = { ..._global.__QuantumState.target.pos };
                }

                if (payload.aim_pitch !== undefined) payload.aim_pitch = _global.__QuantumState.vector.pitch;
                if (payload.aim_yaw !== undefined) payload.aim_yaw = _global.__QuantumState.vector.yaw;
                
                if (payload.client_timestamp !== undefined) {
                    payload.client_timestamp -= (_global.__QuantumState.currentPing * 0.45);
                }
            }
        }

        const rootKeys = ['data', 'events', 'payload', 'messages'];
        for (let i = 0; i < rootKeys.length; i++) {
            const key = rootKeys[i];
            if (payload[key] && (Array.isArray(payload[key]) || typeof payload[key] === 'object')) {
                payload[key] = this.processFastPath(payload[key]);
            }
        }

        return payload;
    }
}

if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"hit_bone"') !== -1 || $response.body.indexOf('"weapon"') !== -1) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new AbsoluteMagnetoEngine().processFastPath(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
