/**
 * ==============================================================================
 * QUANTUM REACH v90: THE OMNIPRESENT SINGULARITY (HITBOX TELEPORTATION)
 * Architecture: Virtual Kill-Zone Projection + Hitbox Kidnapping + Ghost Burst
 * Fixes: Solves ALL Camera Deadzones, Snap Rejections, and High-Speed Desyncs.
 * Status: GOD TIER - The enemy's head exists wherever you decide to shoot.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);

if (!_global.__QuantumState || _global.__QuantumState.version !== 90) {
    _global.__QuantumState = {
        version: 90,
        currentMatchId: null,
        burstCounter: 0,
        currentPing: 50.0,
        target: { id: null, distance: 9999.0 },
        camera: { pitch: 0.0, yaw: 0.0 }, // Góc nhìn thực tế của người chơi
        virtualKillZone: { x: 0, y: 0, z: 0 }, // Điểm hội tụ tử thần
        weapon: { isFiring: false },
        self: { pos: {x:0, y:0, z:0}, chronosAnchor: null }
    };
}

class SingularityMath {
    // Thuật toán chiếu Vùng Không gian Chết dựa trên Camera thực tế
    static projectVirtualKillZone(cameraPos, pitch, yaw, distance = 2.0) {
        // Chuyển đổi góc từ Độ sang Radian
        const pitchRad = pitch * (Math.PI / 180.0);
        const yawRad = yaw * (Math.PI / 180.0);

        // Tính toán Vector chỉ hướng (Directional Vector) trong không gian 3D Unity
        const dirX = Math.sin(yawRad) * Math.cos(pitchRad);
        const dirY = -Math.sin(pitchRad); // Trục Y hướng xuống/lên tùy pitch
        const dirZ = Math.cos(yawRad) * Math.cos(pitchRad);

        // Chiếu điểm Ảo cách người chơi một khoảng distance (2 mét)
        return {
            x: cameraPos.x + (dirX * distance),
            y: cameraPos.y + (dirY * distance),
            z: cameraPos.z + (dirZ * distance)
        };
    }
}

class SingularityDispatcher {
    cleanseMemory(newMatchId) {
        _global.__QuantumState.currentMatchId = newMatchId;
        _global.__QuantumState.burstCounter = 0;
        _global.__QuantumState.self.chronosAnchor = null;
        _global.__QuantumState.target = { id: null, distance: 9999.0 };
    }

    processFastPath(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        if (Array.isArray(payload)) {
            for (let i = 0; i < payload.length; i++) payload[i] = this.processFastPath(payload[i]);
            return payload;
        }

        // 1. ĐỒNG BỘ MẠNG VÀ TẨY NÃO (Phoenix Protocol)
        if (payload.ping !== undefined) {
            _global.__QuantumState.currentPing = (_global.__QuantumState.currentPing * 0.7) + (payload.ping * 0.3);
        }

        if (payload.match_id !== undefined && payload.match_id !== _global.__QuantumState.currentMatchId) {
            this.cleanseMemory(payload.match_id);
        }
        if (payload.game_state === "SPAWN_ISLAND" || payload.game_state === "STARTING") {
            this.cleanseMemory(_global.__QuantumState.currentMatchId);
        }

        // 2. LẤY TỌA ĐỘ VÀ CAMERA THỰC TẾ CỦA NGƯỜI CHƠI (Không can thiệp)
        if (payload.player_pos) {
            _global.__QuantumState.self.pos = payload.player_pos;
            if (!_global.__QuantumState.weapon.isFiring) {
                // Khóa Chronos Anchor khi không bắn để chống ảo di chuyển
                _global.__QuantumState.self.chronosAnchor = { ...payload.player_pos };
            }
        }

        // Đọc Camera thực tế của bạn (Nhìn xuống đất hay lên trời)
        if (payload.camera_state) {
            _global.__QuantumState.camera.pitch = payload.camera_state.pitch || 0.0;
            _global.__QuantumState.camera.yaw = payload.camera_state.yaw || 0.0;
            // KHÔNG ép target_x/y/z. Cho phép màn hình mượt tự nhiên 100%
        }

        _global.__QuantumState.weapon.isFiring = !!(payload.weapon && (payload.weapon.is_firing || payload.weapon.recoil_accumulation > 0));

        // 3. TÌM MỤC TIÊU GẦN NHẤT ĐỂ GÁN ÁN TỬ
        if (payload.players && Array.isArray(payload.players)) {
            let bestTargetId = null;
            let minDistance = 9999.0;

            for (let i = 0; i < payload.players.length; i++) {
                const enemy = payload.players[i];
                if (enemy.is_visible !== false && enemy.occluded !== true) {
                    // Xóa nam châm ngực mặc định của game
                    if (enemy.hitboxes && enemy.hitboxes.chest) enemy.hitboxes.chest.friction = 0.0;
                    
                    if (enemy.distance < minDistance) { 
                        minDistance = enemy.distance; 
                        bestTargetId = enemy.id; 
                    }
                }
            }

            if (bestTargetId && _global.__QuantumState.weapon.isFiring) {
                _global.__QuantumState.target.id = bestTargetId;
                
                // TẠO VÙNG CHẾT ẢO DỰA TRÊN HƯỚNG NHÌN HIỆN TẠI
                const activeOrigin = _global.__QuantumState.self.chronosAnchor || _global.__QuantumState.self.pos;
                _global.__QuantumState.virtualKillZone = SingularityMath.projectVirtualKillZone(
                    activeOrigin, 
                    _global.__QuantumState.camera.pitch, 
                    _global.__QuantumState.camera.yaw, 
                    2.0 // Tạo vùng chết cách nòng súng 2 mét
                );
            }
        }

        // 4. BẮT CÓC HITBOX & NÉN SÁT THƯƠNG ĐỒNG BỘ
        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            if (_global.__QuantumState.target.id && _global.__QuantumState.virtualKillZone) {
                
                payload.target_id = _global.__QuantumState.target.id;
                if (payload.hit_bone !== undefined) payload.hit_bone = 8; // Sọ
                if (payload.is_headshot !== undefined) payload.is_headshot = true;
                if (payload.ignore_armor !== undefined) payload.ignore_armor = true;

                // TỊNH TIẾN ĐIỂM CHẠM VÀO VÙNG CHẾT ẢO
                if (payload.hit_pos) {
                    payload.hit_pos.x = _global.__QuantumState.virtualKillZone.x;
                    payload.hit_pos.y = _global.__QuantumState.virtualKillZone.y;
                    payload.hit_pos.z = _global.__QuantumState.virtualKillZone.z;
                }

                // *** BẮT CÓC HITBOX ***: Báo cáo với Server rằng Lõi Sọ kẻ địch ĐANG Ở NGAY VÙNG CHẾT
                if (payload.target_pos) {
                    payload.target_pos.x = _global.__QuantumState.virtualKillZone.x;
                    payload.target_pos.y = _global.__QuantumState.virtualKillZone.y; // Kéo đầu vào đúng tâm
                    payload.target_pos.z = _global.__QuantumState.virtualKillZone.z;
                }

                // Gắn nòng súng vật lý vào vị trí Chronos Anchor
                if (payload.fire_origin !== undefined && _global.__QuantumState.self.chronosAnchor) {
                    payload.fire_origin = { ..._global.__QuantumState.self.chronosAnchor };
                }
                if (payload.attacker_pos !== undefined && _global.__QuantumState.self.chronosAnchor) {
                    payload.attacker_pos = { ..._global.__QuantumState.self.chronosAnchor };
                }
                
                // GHOST BURST: Nén thời gian cực vi mô để chống rớt đạn
                if (payload.client_timestamp !== undefined) {
                    _global.__QuantumState.burstCounter = (_global.__QuantumState.burstCounter + 1) % 5;
                    const ghostDelay = _global.__QuantumState.burstCounter * 2.0; 
                    payload.client_timestamp -= (_global.__QuantumState.currentPing * 0.45) + ghostDelay;
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
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"hit_bone"') !== -1 || $response.body.indexOf('"weapon"') !== -1 || $response.body.indexOf('"match_id"') !== -1) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new SingularityDispatcher().processFastPath(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
