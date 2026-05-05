/**
 * ==============================================================================
 * QUANTUM REACH v85.OMEGA: THE SILENT SINGULARITY (NO-LIMIT EXECUTION)
 * Architecture: True pSilent + Dynamic Origin + Absolute Backtrack + Magnetism Overdrive
 * Status: GOD TIER - Invisible to AI, mathematically perfect trajectory.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== "85_OMEGA") {
    _global.__QuantumState = {
        version: "85_OMEGA",
        currentMatchId: null,
        currentPing: 50.0,
        fireSequence: 0,
        target: { id: null, pos: null, distance: 9999.0 },
        vector: { pitch: 0.0, yaw: 0.0 },
        weapon: { isFiring: false, recoilY: 0.0, spreadX: 0.0 },
        self: { anchorPos: {x:0, y:0, z:0}, currentPos: {x:0, y:0, z:0} }
    };
}

class OmegaMath {
    // Tọa độ tĩnh tuyệt đối: Không đón đầu tương lai, nhắm thẳng vào Lõi Sọ
    static calculateCoreTarget(headPos, headRadius) {
        const neckOffset = (headRadius || 0.18) * 0.75; 
        return {
            x: headPos.x,
            y: headPos.y - neckOffset, // Hạ điểm ngắm nhẹ để bù trừ Server Recoil
            z: headPos.z
        };
    }

    // Tính Vector ngắm ngầm (pSilent) từ điểm Neo Thời Không
    static calculateSilentVector(fromPos, toPos, recoilY, spreadX) {
        if (!fromPos || !toPos) return { pitch: 0, yaw: 0 };
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const dz = toPos.z - fromPos.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz);
        
        let yaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
        let pitch = Math.atan2(-dy, distXZ) * (180.0 / Math.PI);

        // Khử giật nghịch đảo ở tầng gói tin
        pitch -= (recoilY * 1.5); 
        yaw -= (spreadX * 1.5);   

        return { pitch, yaw };
    }
}

class OmegaDispatcher {
    cleanseMemory() {
        _global.__QuantumState.target = { id: null, pos: null, distance: 9999.0 };
        _global.__QuantumState.fireSequence = 0;
    }

    processFastPath(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        if (Array.isArray(payload)) {
            for (let i = 0; i < payload.length; i++) payload[i] = this.processFastPath(payload[i]);
            return payload;
        }

        // 1. ĐỒNG BỘ MÔI TRƯỜNG MẠNG VÀ THỜI KHÔNG
        if (payload.ping !== undefined) {
            _global.__QuantumState.currentPing = (_global.__QuantumState.currentPing * 0.6) + (payload.ping * 0.4);
        }

        if (payload.match_id !== undefined && payload.match_id !== _global.__QuantumState.currentMatchId) {
            _global.__QuantumState.currentMatchId = payload.match_id;
            this.cleanseMemory();
        }

        if (payload.player_pos) {
            _global.__QuantumState.self.anchorPos = { ..._global.__QuantumState.self.currentPos };
            _global.__QuantumState.self.currentPos = payload.player_pos;
        }

        // Tắt toàn bộ cờ chuyển động trên không để chống rớt đạn
        const stanceKeys = ['stance', 'pose_id', 'posture'];
        stanceKeys.forEach(k => { if (payload[k] !== undefined) payload[k] = "CROUCH"; });
        if (payload.is_jumping !== undefined) payload.is_jumping = false;
        if (payload.in_air !== undefined) payload.in_air = false;

        // 2. NHẬN DIỆN CHU KỲ BÓP CÒ
        _global.__QuantumState.weapon.isFiring = false;
        if (payload.weapon) {
            _global.__QuantumState.weapon.isFiring = !!(payload.weapon.is_firing || payload.weapon.recoil_accumulation > 0);
            if (_global.__QuantumState.weapon.isFiring) {
                _global.__QuantumState.weapon.recoilY = payload.weapon.recoil_accumulation || 0.05;
                _global.__QuantumState.weapon.spreadX = payload.weapon.progressive_spread || 0.02;
                
                // Nén độ giật hiển thị trên Client
                if (payload.weapon.recoil_accumulation) payload.weapon.recoil_accumulation *= 0.01;
                if (payload.weapon.progressive_spread) payload.weapon.progressive_spread *= 0.01;
            }
        }

        // 3. TỪ TÍNH CỰC ĐẠI (MAGNETISM OVERDRIVE) & KHÓA MỤC TIÊU
        if (payload.players && Array.isArray(payload.players)) {
            let bestTarget = null;
            let minDistance = 9999.0;

            for (let i = 0; i < payload.players.length; i++) {
                const enemy = payload.players[i];
                
                if (enemy.hitboxes) {
                    // Dọn đường: Biến thân thể thành không khí
                    const bodyParts = ['chest', 'spine', 'pelvis', 'left_arm', 'right_arm', 'left_leg', 'right_leg', 'neck'];
                    bodyParts.forEach(part => {
                        if (enemy.hitboxes[part]) {
                            enemy.hitboxes[part].priority = "IGNORE";
                            enemy.hitboxes[part].friction = 0.0;
                            enemy.hitboxes[part].magnetism = 0.0;
                            enemy.hitboxes[part].snap_weight = -9999.0;
                        }
                    });
                    
                    // Hố Đen: Ép cực đại vào Lõi Sọ
                    if (enemy.hitboxes['head']) {
                        enemy.hitboxes['head'].priority = "ABSOLUTE";
                        enemy.hitboxes['head'].magnetism = 999.0;
                        enemy.hitboxes['head'].friction = 99.0;
                        enemy.hitboxes['head'].snap_weight = 9999.0;
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
                _global.__QuantumState.target.pos = OmegaMath.calculateCoreTarget(bestTarget.head_pos, bestTarget.hitboxes?.head?.radius);

                // pSilent Aim: Tính toán Vector bẻ đạn, không can thiệp Camera
                const activeOrigin = _global.__QuantumState.self.anchorPos;
                const masterVector = OmegaMath.calculateSilentVector(
                    activeOrigin, 
                    _global.__QuantumState.target.pos,
                    _global.__QuantumState.weapon.recoilY,
                    _global.__QuantumState.weapon.spreadX
                );
                
                _global.__QuantumState.vector.pitch = masterVector.pitch;
                _global.__QuantumState.vector.yaw = masterVector.yaw;

                // Xóa lệnh bẻ Camera, màn hình giữ nguyên 100% tự nhiên
                if (payload.camera_state) {
                    delete payload.camera_state.target_x;
                    delete payload.camera_state.target_y;
                    delete payload.camera_state.target_z;
                    payload.camera_state.interpolation = "SMOOTH";
                }
            }
        }

        // 4. THE SILENT EXECUTION (HÀNH QUYẾT BÓNG ĐÊM)
        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            if (_global.__QuantumState.target.id && _global.__QuantumState.target.pos) {
                
                // Cưỡng chế mọi tia raycast thành Sát thương Đầu
                payload.target_id = _global.__QuantumState.target.id;
                if (payload.hit_bone !== undefined) payload.hit_bone = 8;
                if (payload.is_headshot !== undefined) payload.is_headshot = true;
                if (payload.penetration_ratio !== undefined) payload.penetration_ratio = 1.0;
                if (payload.ignore_armor !== undefined) payload.ignore_armor = true;

                // DYNAMIC TELESCOPIC ORIGIN (Xuyên Tường & Dịch Chuyển Nòng Súng)
                if (payload.fire_origin !== undefined) {
                    const safetyMargin = 0.5; // Luôn dừng trước mặt địch 0.5m
                    if (_global.__QuantumState.target.distance > safetyMargin) {
                        const activeOrigin = _global.__QuantumState.self.anchorPos;
                        const targetPos = _global.__QuantumState.target.pos; 
                        const ratio = (_global.__QuantumState.target.distance - safetyMargin) / _global.__QuantumState.target.distance;
                        
                        payload.fire_origin.x = activeOrigin.x + (targetPos.x - activeOrigin.x) * ratio;
                        payload.fire_origin.y = activeOrigin.y + (targetPos.y - activeOrigin.y) * ratio;
                        payload.fire_origin.z = activeOrigin.z + (targetPos.z - activeOrigin.z) * ratio;
                    } else {
                        payload.fire_origin = { ..._global.__QuantumState.target.pos };
                    }
                }

                if (payload.attacker_pos !== undefined) {
                    payload.attacker_pos = { ..._global.__QuantumState.self.anchorPos };
                }

                if (payload.hit_pos) {
                    payload.hit_pos = { ..._global.__QuantumState.target.pos };
                }

                // TIÊM VECTOR ẢO (pSilent): Ngắm bụng, đạn bay lên não
                if (payload.aim_pitch !== undefined) payload.aim_pitch = _global.__QuantumState.vector.pitch;
                if (payload.aim_yaw !== undefined) payload.aim_yaw = _global.__QuantumState.vector.yaw;
                
                // ABSOLUTE BACKTRACKING: Trừ đi Ping thực tế + 150ms quá khứ
                if (payload.client_timestamp !== undefined) {
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

// EXECUTION BLOCK
if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"hit_bone"') !== -1 || $response.body.indexOf('"weapon"') !== -1 || $response.body.indexOf('"fire_origin"') !== -1) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new OmegaDispatcher().processFastPath(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
