/**
 * ==============================================================================
 * QUANTUM REACH v85: OMNI-CHRONOS (THE SILENT EXECUTION)
 * Architecture: pSilent Aim + Dynamic Origin + Absolute Backtrack + Magnetism Overdrive
 * Fixes: Completely removes camera snapping. Solves all angular rejections.
 * Status: GOD TIER - Invisible, Mathematically Perfect, No-Limit Execution.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 85.99) {
    _global.__QuantumState = {
        version: 85.99, // Đánh dấu phiên bản v85 tối thượng
        currentMatchId: null,
        currentPing: 50.0,
        target: { id: null, pos: null, distance: 999.0 },
        vector: { pitch: 0.0, yaw: 0.0 }, 
        weapon: { isFiring: false, recoilY: 0.0, spreadX: 0.0 },
        self: { 
            pos: {x:0, y:0, z:0}, 
            chronosAnchor: null 
        }
    };
}

class OmniChronosMath {
    // 1. TỌA ĐỘ ỔN ĐỊNH: Không đón đầu tương lai, chỉ nhắm vào tĩnh lặng
    static calculateStableTarget(headPos, headRadius) {
        const neckOffset = (headRadius || 0.18) * 0.85;
        return {
            x: headPos.x,
            y: headPos.y - neckOffset, // Hạ yết hầu bù giật server
            z: headPos.z
        };
    }

    // 2. VECTOR NGHỊCH ĐẢO: Dùng cho pSilent Aim
    static generateInverseMasterVector(fromPos, toPos, recoilY, spreadX) {
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

class OmniChronosEngine {
    cleanseMemory() {
        _global.__QuantumState.self.chronosAnchor = null;
        _global.__QuantumState.target = { id: null, pos: null, distance: 999.0 };
    }

    processFastPath(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        if (Array.isArray(payload)) {
            for (let i = 0; i < payload.length; i++) payload[i] = this.processFastPath(payload[i]);
            return payload;
        }

        // ĐỒNG BỘ PING
        if (payload.ping !== undefined) {
            _global.__QuantumState.currentPing = (_global.__QuantumState.currentPing * 0.7) + (payload.ping * 0.3);
        }

        // RESET TRẬN MỚI
        if (payload.match_id !== undefined && payload.match_id !== _global.__QuantumState.currentMatchId) {
            _global.__QuantumState.currentMatchId = payload.match_id;
            this.cleanseMemory();
        }

        // THIẾT LẬP CHRONOS ANCHOR (Bảo vệ thân thể)
        if (payload.player_pos) {
            _global.__QuantumState.self.pos = payload.player_pos;
            if (!_global.__QuantumState.weapon.isFiring) {
                _global.__QuantumState.self.chronosAnchor = { ...payload.player_pos };
            }
        }

        // TẮT CHUYỂN ĐỘNG TRÊN KHÔNG
        const stanceKeys = ['stance', 'pose_id', 'posture'];
        stanceKeys.forEach(k => { if (payload[k] !== undefined) payload[k] = "CROUCH"; });
        if (payload.is_jumping !== undefined) payload.is_jumping = false;
        if (payload.in_air !== undefined) payload.in_air = false;

        // ĐỌC VŨ KHÍ & ĐỘ GIẬT
        _global.__QuantumState.weapon.isFiring = false;
        if (payload.weapon) {
            _global.__QuantumState.weapon.isFiring = !!(payload.weapon.is_firing || payload.weapon.recoil_accumulation > 0);
            if (_global.__QuantumState.weapon.isFiring) {
                // Thu thập độ giật để bù trừ ngầm
                _global.__QuantumState.weapon.recoilY = payload.weapon.recoil_accumulation || 0.0;
                _global.__QuantumState.weapon.spreadX = payload.weapon.progressive_spread || 0.0;
            }
        }

        // XỬ LÝ MỤC TIÊU & TỪ TÍNH CỰC ĐẠI
        if (payload.players && Array.isArray(payload.players)) {
            let bestTarget = null;
            let minDistance = 9999.0;

            for (let i = 0; i < payload.players.length; i++) {
                const enemy = payload.players[i];
                
                // GIẢI PHÁP 4: MAGNETISM OVERDRIVE
                if (enemy.hitboxes) {
                    const bodyParts = ['chest', 'spine', 'pelvis', 'left_arm', 'right_arm', 'left_leg', 'right_leg', 'neck'];
                    bodyParts.forEach(part => {
                        if (enemy.hitboxes[part]) {
                            enemy.hitboxes[part].priority = "IGNORE";
                            enemy.hitboxes[part].friction = 0.0;
                            enemy.hitboxes[part].magnetism = 0.0;
                        }
                    });
                    
                    // Ép đầu thành hố đen từ tính
                    if (enemy.hitboxes['head']) {
                        enemy.hitboxes['head'].priority = "ABSOLUTE";
                        enemy.hitboxes['head'].magnetism = 999.0;
                        enemy.hitboxes['head'].friction = 99.0;
                    }
                }

                if (enemy.is_visible !== false && enemy.occluded !== true) {
                    if (enemy.distance < minDistance) { 
                        minDistance = enemy.distance; 
                        bestTarget = enemy; 
                    }
                }
            }

            if (bestTarget && bestTarget.head_pos && _global.__QuantumState.weapon.isFiring) {
                _global.__QuantumState.target.id = bestTarget.id;
                _global.__QuantumState.target.distance = minDistance;
                
                const headRadius = bestTarget.hitboxes?.head?.radius || 0.18;
                _global.__QuantumState.target.pos = OmniChronosMath.calculateStableTarget(bestTarget.head_pos, headRadius);

                const activeOrigin = _global.__QuantumState.self.chronosAnchor || _global.__QuantumState.self.pos;
                
                // Tính Vector Ngầm
                const masterVector = OmniChronosMath.generateInverseMasterVector(
                    activeOrigin, 
                    _global.__QuantumState.target.pos,
                    _global.__QuantumState.weapon.recoilY,
                    _global.__QuantumState.weapon.spreadX
                );
                
                _global.__QuantumState.vector.pitch = masterVector.pitch;
                _global.__QuantumState.vector.yaw = masterVector.yaw;

                // GIẢI PHÁP 1: pSILENT AIM
                // TUYỆT ĐỐI KHÔNG can thiệp vào payload.camera_state. Màn hình người chơi giữ nguyên sự tự nhiên.
            }
        }

        // ĐỒNG BỘ GÓI TIN SÁT THƯƠNG
        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            if (_global.__QuantumState.target.id && _global.__QuantumState.target.pos) {
                payload.target_id = _global.__QuantumState.target.id;
                if (payload.hit_bone !== undefined) payload.hit_bone = 8;
                if (payload.is_headshot !== undefined) payload.is_headshot = true;
                if (payload.penetration_ratio !== undefined) payload.penetration_ratio = 1.0;
                if (payload.ignore_armor !== undefined) payload.ignore_armor = true;
                
                // GIẢI PHÁP 2: DYNAMIC ORIGIN INTERPOLATION
                if (payload.fire_origin !== undefined) {
                    const safetyMargin = 0.5; // Luôn cách mặt địch 0.5m
                    if (_global.__QuantumState.target.distance > safetyMargin) {
                        const activeOrigin = _global.__QuantumState.self.chronosAnchor || _global.__QuantumState.self.pos;
                        const targetPos = _global.__QuantumState.target.pos; 
                        const ratio = (_global.__QuantumState.target.distance - safetyMargin) / _global.__QuantumState.target.distance;
                        
                        payload.fire_origin.x = activeOrigin.x + (targetPos.x - activeOrigin.x) * ratio;
                        payload.fire_origin.y = activeOrigin.y + (targetPos.y - activeOrigin.y) * ratio;
                        payload.fire_origin.z = activeOrigin.z + (targetPos.z - activeOrigin.z) * ratio;
                    } else {
                        // Cận chiến sát rạt
                        payload.fire_origin = { ..._global.__QuantumState.target.pos };
                    }
                }

                if (payload.attacker_pos !== undefined && _global.__QuantumState.self.chronosAnchor) {
                    payload.attacker_pos = { ..._global.__QuantumState.self.chronosAnchor };
                }

                if (payload.hit_pos) {
                    payload.hit_pos = { ..._global.__QuantumState.target.pos };
                }

                // Tiêm Vector Ảo vào đường đạn (Màn hình ngắm một nơi, đạn bay một nẻo)
                if (payload.aim_pitch !== undefined) payload.aim_pitch = _global.__QuantumState.vector.pitch;
                if (payload.aim_yaw !== undefined) payload.aim_yaw = _global.__QuantumState.vector.yaw;
                
                // GIẢI PHÁP 3: ABSOLUTE BACKTRACKING (Hành Quyết Quá Khứ)
                if (payload.client_timestamp !== undefined) {
                    // Lùi thời gian: Ping + 150ms độ trễ lịch sử tĩnh
                    // Ép Server phải soi tia Raycast vào lúc kẻ địch chưa kịp di chuyển
                    payload.client_timestamp -= (_global.__QuantumState.currentPing + 150.0);
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
            const mutated = new OmniChronosEngine().processFastPath(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
