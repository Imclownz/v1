/**
 * ==============================================================================
 * PROJECT: OMNI-AVATAR v100 (THE REALITY BENDER)
 * Architecture: Stance Nullification + Hitbox Tesselation + Omni-Magic Bullet
 * Status: GOD TIER - No-Aim, No-Snap, 100% Reality Distortion Execution.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);

if (!_global.__OmniState || _global.__OmniState.version !== 100) {
    _global.__OmniState = {
        version: 100,
        currentPing: 50.0,
        target: { id: null, pos: null, distance: 9999.0 },
        self: { pos: {x:0, y:0, z:0} }
    };
}

class RealityMath {
    // Thuật toán Nghịch đảo Cự ly siêu gần (Tính góc bóp cò từ khoảng cách 0.1m)
    static calculateExecutionAngles(fromPos, toPos) {
        if (!fromPos || !toPos) return { pitch: 0, yaw: 0 };
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const dz = toPos.z - fromPos.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz);
        
        let yaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
        let pitch = Math.atan2(-dy, distXZ) * (180.0 / Math.PI);

        return { pitch, yaw };
    }

    // Tịnh tiến Phân thân đến sát mặt kẻ địch (Khoảng cách tàn sát: 0.15m)
    static generateAvatarSpoof(targetPos) {
        return {
            x: targetPos.x + 0.15,
            y: targetPos.y, // Ngang tầm mắt
            z: targetPos.z + 0.15
        };
    }
}

class OmniAvatarEngine {
    processDistortion(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        // Xử lý đệ quy cho mảng gói tin
        if (Array.isArray(payload)) {
            for (let i = 0; i < payload.length; i++) payload[i] = this.processDistortion(payload[i]);
            return payload;
        }

        // ĐỒNG BỘ MẠNG TĨNH
        if (payload.ping !== undefined) {
            _global.__OmniState.currentPing = (_global.__OmniState.currentPing * 0.5) + (payload.ping * 0.5);
        }

        if (payload.player_pos) _global.__OmniState.self.pos = payload.player_pos;

        // 1. GIẢI PHÁP 2 & 3: BÌNH CHUẨN HÓA TƯ THẾ VÀ PHÓNG TO LÕI SỌ
        if (payload.players && Array.isArray(payload.players)) {
            let bestTarget = null;
            let minDistance = 99999.0;

            for (let i = 0; i < payload.players.length; i++) {
                const enemy = payload.players[i];

                // STANCE NULLIFICATION: Ép mọi kẻ địch đứng thẳng như một cái cọc
                const stanceCues = ['stance', 'pose_id', 'posture', 'action_state'];
                stanceCues.forEach(k => { 
                    if (enemy[k] !== undefined) enemy[k] = "STANDING"; // Hoặc 0 tùy cấu trúc Engine
                });
                if (enemy.is_jumping !== undefined) enemy.is_jumping = false;
                if (enemy.in_air !== undefined) enemy.in_air = false;

                // Cố định chiều cao Lõi sọ (Khử sai số khi địch nằm sấp/lộn nhào)
                if (enemy.head_pos) {
                    enemy.head_pos.y = enemy.pos ? enemy.pos.y + 1.65 : enemy.head_pos.y;
                }

                // HITBOX TESSELATION: Xóa bỏ thân thể, phóng to đầu bao trùm màn hình
                if (enemy.hitboxes) {
                    const bodyParts = ['chest', 'spine', 'pelvis', 'left_arm', 'right_arm', 'left_leg', 'right_leg', 'neck'];
                    bodyParts.forEach(part => {
                        if (enemy.hitboxes[part]) {
                            enemy.hitboxes[part].priority = "IGNORE";
                            enemy.hitboxes[part].radius = 0.0;
                            enemy.hitboxes[part].interaction_zone = 0.0;
                        }
                    });

                    // Phóng to Lõi sọ lên mức khổng lồ (Bao phủ 50 mét)
                    if (enemy.hitboxes['head']) {
                        enemy.hitboxes['head'].priority = "ABSOLUTE";
                        enemy.hitboxes['head'].radius = 50.0; // Điểm mù của Client bị phá vỡ
                        enemy.hitboxes['head'].interaction_zone = 999.0;
                        enemy.hitboxes['head'].magnetism = 9999.0; 
                    }
                }

                // Tìm mục tiêu gần nhất trong thực tại ảo
                if (enemy.is_visible !== false && enemy.distance < minDistance) { 
                    minDistance = enemy.distance; 
                    bestTarget = enemy; 
                }
            }

            if (bestTarget && bestTarget.head_pos) {
                _global.__OmniState.target.id = bestTarget.id;
                _global.__OmniState.target.pos = { ...bestTarget.head_pos };
                
                // TUYỆT ĐỐI KHÔNG DÙNG LÒ XO HAY KÉO CAMERA
                // Client tự động hiểu là đang ngắm vào đầu vì Hitbox Đầu giờ đã bao trùm cả màn hình
                if (payload.camera_state) {
                    delete payload.camera_state.target_x;
                    delete payload.camera_state.target_y;
                    delete payload.camera_state.target_z;
                    payload.camera_state.interpolation = "NATURAL"; // Trả lại sự tự nhiên 100% cho màn hình
                }
            }
        }

        // 2. GIẢI PHÁP 1: OMNI-MAGIC BULLET (PHÂN THÂN MA ĐẠN ĐA HƯỚNG)
        // Khi bạn xả đạn (dù là xả xuống đất), Client sẽ báo trúng vì Hitbox đầu địch quá to. 
        // Ngay khoảnh khắc đó, chúng ta Đánh Tráo Thực Tại (Reality Spoofing).
        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            if (_global.__OmniState.target.id && _global.__OmniState.target.pos) {
                
                // Ép cờ sát thương
                payload.target_id = _global.__OmniState.target.id;
                payload.hit_bone = 8;
                payload.is_headshot = true;
                if (payload.ignore_armor !== undefined) payload.ignore_armor = true;

                // TẠO PHÂN THÂN TÀNG HÌNH: Dời toàn bộ bản thể của bạn đến sát mặt địch
                const spoofedAvatarPos = RealityMath.generateAvatarSpoof(_global.__OmniState.target.pos);

                if (payload.attacker_pos) {
                    payload.attacker_pos = { ...spoofedAvatarPos };
                }
                if (payload.fire_origin) {
                    payload.fire_origin = { ...spoofedAvatarPos };
                }
                if (payload.hit_pos) {
                    payload.hit_pos = { ..._global.__OmniState.target.pos };
                }

                // Tính toán Vector ngắm Hợp Lệ 100% từ Phân thân đến Lõi sọ
                const executionAngles = RealityMath.calculateExecutionAngles(spoofedAvatarPos, _global.__OmniState.target.pos);

                // Ghi đè Vector của viên đạn (Màn hình bạn ngắm xuống đất, nhưng Avatar ảo ngắm vào trán địch)
                if (payload.aim_pitch !== undefined) payload.aim_pitch = executionAngles.pitch;
                if (payload.aim_yaw !== undefined) payload.aim_yaw = executionAngles.yaw;
                if (payload.camera_pitch !== undefined) payload.camera_pitch = executionAngles.pitch; // Đồng bộ Camera ảo
                if (payload.camera_yaw !== undefined) payload.camera_yaw = executionAngles.yaw;

                // ABSOLUTE BACKTRACK: Đóng băng không gian thời gian (-200ms tĩnh)
                if (payload.client_timestamp !== undefined) {
                    payload.client_timestamp -= (_global.__OmniState.currentPing + 200.0);
                }
            }
        }

        // Định tuyến quy đệ quy tốc độ cao
        const rootKeys = ['data', 'events', 'payload', 'messages'];
        for (let i = 0; i < rootKeys.length; i++) {
            const key = rootKeys[i];
            if (payload[key] && (Array.isArray(payload[key]) || typeof payload[key] === 'object')) {
                payload[key] = this.processDistortion(payload[key]);
            }
        }

        return payload;
    }
}

// BỘ KÍCH HOẠT ĐA CHIỀU
if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"hit_bone"') !== -1 || $response.body.indexOf('"fire_origin"') !== -1) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new OmniAvatarEngine().processDistortion(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
