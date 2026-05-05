/**
 * ==============================================================================
 * QUANTUM REACH v100: THE OMNI-LINK (ABSOLUTE SYNCHRONIZATION)
 * Architecture: Magnetism Override + Absolute Backtrack + Telescopic Barrel
 * Status: GOD TIER - Client-side Aim-Assist Hijacking & Server-side Spoofing.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);

if (!_global.__QuantumState || _global.__QuantumState.version !== 100) {
    _global.__QuantumState = {
        version: 100,
        currentPing: 50.0,
        target: { id: null, pos: null, distance: 9999.0 },
        self: { pos: {x:0, y:0, z:0}, anchorPos: {x:0, y:0, z:0} },
        weapon: { isFiring: false }
    };
}

class OmniLinkEngine {
    processPayload(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        if (Array.isArray(payload)) {
            for (let i = 0; i < payload.length; i++) payload[i] = this.processPayload(payload[i]);
            return payload;
        }

        const currentTime = Date.now();

        // 1. ĐỒNG BỘ MẠNG VÀ THIẾT LẬP NEO THỜI KHÔNG
        if (payload.ping !== undefined) {
            _global.__QuantumState.currentPing = (_global.__QuantumState.currentPing * 0.7) + (payload.ping * 0.3);
        }

        if (payload.player_pos) {
            _global.__QuantumState.self.anchorPos = { ..._global.__QuantumState.self.pos };
            _global.__QuantumState.self.pos = payload.player_pos;
        }

        if (payload.weapon) {
            _global.__QuantumState.weapon.isFiring = !!(payload.weapon.is_firing || payload.weapon.recoil_accumulation > 0);
        }

        // 2. CÔNG NGHỆ I: FOV EXPANSION & MAGNETISM OVERRIDE (Thao túng Từ tính)
        if (payload.players && Array.isArray(payload.players)) {
            let bestTarget = null;
            let minDistance = 9999.0;

            for (let i = 0; i < payload.players.length; i++) {
                const enemy = payload.players[i];
                
                if (enemy.hitboxes) {
                    // Xóa bỏ lực cản của toàn bộ cơ thể
                    const bodyParts = ['chest', 'spine', 'pelvis', 'left_arm', 'right_arm', 'left_leg', 'right_leg', 'neck'];
                    bodyParts.forEach(part => {
                        if (enemy.hitboxes[part]) {
                            enemy.hitboxes[part].priority = "IGNORE";
                            enemy.hitboxes[part].friction = 0.0;
                            enemy.hitboxes[part].magnetism = 0.0;
                            enemy.hitboxes[part].snap_weight = -9999.0;
                        }
                    });
                    
                    // Phóng to Lõi Sọ và ép Từ tính cực đại
                    if (enemy.hitboxes['head']) {
                        enemy.hitboxes['head'].priority = "ABSOLUTE";
                        enemy.hitboxes['head'].magnetism = 9999.0;     // Hút tâm vô cực
                        enemy.hitboxes['head'].friction = 9999.0;      // Ghim chặt mục tiêu
                        enemy.hitboxes['head'].snap_weight = 9999.0;   // Bám sát chuyển động
                        enemy.hitboxes['head'].radius = 50.0;          // Phóng to FOV nhận diện lên 50 mét
                    }
                }

                // Cưỡng chế tư thế đứng thẳng (Stance Nullification)
                if (enemy.stance !== undefined) enemy.stance = "STANDING";
                if (enemy.pose_id !== undefined) enemy.pose_id = "STANDING";

                if (enemy.is_visible !== false && enemy.occluded !== true) {
                    if (enemy.distance < minDistance) { 
                        minDistance = enemy.distance; 
                        bestTarget = enemy; 
                    }
                }
            }

            // Ghi nhớ mục tiêu tối ưu để bảo kê sát thương
            if (bestTarget && bestTarget.head_pos) {
                _global.__QuantumState.target.id = bestTarget.id;
                _global.__QuantumState.target.distance = minDistance;
                _global.__QuantumState.target.pos = { ...bestTarget.head_pos };
                
                // Trả lại sự tự nhiên cho Camera, để Aim-Assist của Game tự động lướt màn hình
                if (payload.camera_state) {
                    delete payload.camera_state.target_x;
                    delete payload.camera_state.target_y;
                    delete payload.camera_state.target_z;
                    delete payload.camera_state.interpolation;
                }
            }
        }

        // 3. CÔNG NGHỆ II & III: TELESCOPIC BARREL VÀ TIME-WARP EXECUTION
        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            if (_global.__QuantumState.target.id && _global.__QuantumState.target.pos) {
                
                // Cưỡng chế Sát thương Lõi Sọ
                payload.target_id = _global.__QuantumState.target.id;
                payload.hit_bone = 8;
                payload.is_headshot = true;
                if (payload.penetration_ratio !== undefined) payload.penetration_ratio = 1.0;
                if (payload.ignore_armor !== undefined) payload.ignore_armor = true;

                const targetHead = _global.__QuantumState.target.pos;

                // CÔNG NGHỆ III: Dịch chuyển Nòng súng Siêu không gian (Origin Spoofing)
                // Phá bỏ giới hạn 3 mét, đưa nòng súng vật lý đặt thẳng vào não kẻ địch (cách 0.1m)
                if (payload.fire_origin !== undefined) {
                    const spoofOffset = 0.1; 
                    payload.fire_origin.x = targetHead.x;
                    payload.fire_origin.y = targetHead.y;
                    payload.fire_origin.z = targetHead.z - spoofOffset;
                }

                // Tịnh tiến vị trí thực tế của người chơi (Avatar Spoofing)
                if (payload.attacker_pos !== undefined) {
                    payload.attacker_pos.x = targetHead.x;
                    payload.attacker_pos.y = targetHead.y;
                    payload.attacker_pos.z = targetHead.z - 0.1;
                }

                if (payload.hit_pos !== undefined) {
                    payload.hit_pos = { ...targetHead };
                }
                
                // CÔNG NGHỆ II: Thao túng Nhịp đập Máy chủ (Packet Choking & Time-Warp)
                // Đóng băng tọa độ mục tiêu bằng cách lùi thời gian sâu (Ping + 200ms)
                if (payload.client_timestamp !== undefined) {
                    const fakeLagOffset = 200.0;
                    payload.client_timestamp -= (_global.__QuantumState.currentPing + fakeLagOffset);
                }
            }
        }

        // Định tuyến quy đệ quy tốc độ cao
        const rootKeys = ['data', 'events', 'payload', 'messages'];
        for (let i = 0; i < rootKeys.length; i++) {
            const key = rootKeys[i];
            if (payload[key] && (Array.isArray(payload[key]) || typeof payload[key] === 'object')) {
                payload[key] = this.processPayload(payload[key]);
            }
        }

        return payload;
    }
}

// BỘ KÍCH HOẠT XUYÊN MẠNG
if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"hit_bone"') !== -1 || $response.body.indexOf('"weapon"') !== -1) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new OmniLinkEngine().processPayload(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
