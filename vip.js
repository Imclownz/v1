/**
 * ==============================================================================
 * PROJECT: OMNI-AVATAR v100 (REALITY DISTORTION)
 * Architecture: Hitbox Tesselation + Stance Nullification + Omni-Magic Bullet
 * Status: GOD TIER - Zero Aim, Zero Snap, Absolute Point-Blank Execution.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);

if (!_global.__OmniState || _global.__OmniState.version !== 100) {
    _global.__OmniState = {
        version: 100,
        currentPing: 50.0,
        target: { id: null, pos: null, distance: 9999.0 }
    };
}

class RealityDistortionEngine {
    processPayload(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        if (Array.isArray(payload)) {
            for (let i = 0; i < payload.length; i++) payload[i] = this.processPayload(payload[i]);
            return payload;
        }

        // ĐỒNG BỘ PING ĐỂ LÙI THỜI GIAN
        if (payload.ping !== undefined) {
            _global.__OmniState.currentPing = (_global.__OmniState.currentPing * 0.5) + (payload.ping * 0.5);
        }

        // 1. STANCE NULLIFICATION & HITBOX TESSELATION (Bình Chuẩn Tư Thế & Phóng To Sọ)
        if (payload.players && Array.isArray(payload.players)) {
            let bestTarget = null;
            let minDistance = 9999.0;

            for (let i = 0; i < payload.players.length; i++) {
                const enemy = payload.players[i];

                // GIẢI PHÁP 2: ÉP KẺ ĐỊCH ĐỨNG YÊN TRONG DỮ LIỆU
                const stanceKeys = ['stance', 'pose_id', 'posture', 'action_state'];
                stanceKeys.forEach(k => { 
                    if (enemy[k] !== undefined) enemy[k] = "STANDING"; // Cưỡng chế tư thế đứng
                });
                if (enemy.is_jumping !== undefined) enemy.is_jumping = false;
                if (enemy.in_air !== undefined) enemy.in_air = false;

                // Khóa cứng tọa độ Đầu ở độ cao chuẩn (1.65m), bất chấp địch đang ngồi hay nằm
                if (enemy.head_pos && enemy.pos) {
                    enemy.head_pos.y = enemy.pos.y + 1.65;
                }

                // GIẢI PHÁP 3: PHÓNG TO LÕI SỌ BAO TRÙM MÀN HÌNH
                if (enemy.hitboxes) {
                    const bodyParts = ['chest', 'spine', 'pelvis', 'left_arm', 'right_arm', 'left_leg', 'right_leg', 'neck'];
                    bodyParts.forEach(part => {
                        if (enemy.hitboxes[part]) {
                            enemy.hitboxes[part].priority = "IGNORE";
                            enemy.hitboxes[part].radius = 0.0; // Triệt tiêu diện tích thân
                            enemy.hitboxes[part].friction = 0.0;
                        }
                    });
                    
                    if (enemy.hitboxes['head']) {
                        enemy.hitboxes['head'].priority = "ABSOLUTE";
                        enemy.hitboxes['head'].radius = 50.0; // Phóng to bán kính sọ lên 50 mét
                        enemy.hitboxes['head'].magnetism = 9999.0;
                    }
                }

                if (enemy.is_visible !== false && enemy.occluded !== true && enemy.distance < minDistance) { 
                    minDistance = enemy.distance; 
                    bestTarget = enemy; 
                }
            }

            // Ghi nhớ mục tiêu khả dĩ nhất
            if (bestTarget && bestTarget.head_pos) {
                _global.__OmniState.target.id = bestTarget.id;
                _global.__OmniState.target.distance = minDistance;
                _global.__OmniState.target.pos = { ...bestTarget.head_pos };
            }
            
            // Tuyệt đối không chạm vào payload.camera_state. Trả lại sự tự do 100% cho màn hình.
        }

        // 2. OMNI-MAGIC BULLET (Phân Thân Ma Đạn & Hành Quyết)
        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            if (_global.__OmniState.target.id && _global.__OmniState.target.pos) {
                
                // Cưỡng chế Sát thương Lõi Sọ
                payload.target_id = _global.__OmniState.target.id;
                payload.hit_bone = 8;
                payload.is_headshot = true;
                if (payload.ignore_armor !== undefined) payload.ignore_armor = true;

                // GIẢI PHÁP 1: DỊCH CHUYỂN BẢN THÂN VÀ NÒNG SÚNG (AVATAR SPOOFING)
                const tPos = _global.__OmniState.target.pos;
                // Tạo một bản sao tàng hình cách mặt kẻ địch đúng 10cm (Point-blank range)
                const pointBlankPos = { 
                    x: tPos.x, 
                    y: tPos.y, 
                    z: tPos.z - 0.1 
                };

                if (payload.fire_origin !== undefined) payload.fire_origin = { ...pointBlankPos };
                if (payload.attacker_pos !== undefined) payload.attacker_pos = { ...pointBlankPos };
                if (payload.hit_pos !== undefined) payload.hit_pos = { ...tPos };

                // Ghi đè Vector ngắm: Vì đang kề sát sọ, góc ngắm tuyệt đối là 0.0 ngang/dọc
                if (payload.aim_pitch !== undefined) payload.aim_pitch = 0.0;
                if (payload.aim_yaw !== undefined) payload.aim_yaw = 0.0;
                if (payload.camera_pitch !== undefined) payload.camera_pitch = 0.0;
                if (payload.camera_yaw !== undefined) payload.camera_yaw = 0.0;
                
                // Đóng băng thời gian Máy chủ: Lùi Ping + 200ms
                if (payload.client_timestamp !== undefined) {
                    payload.client_timestamp -= (_global.__OmniState.currentPing + 200.0);
                }
            }
        }

        // Đệ quy luồng dữ liệu
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

// BỘ KÍCH HOẠT OMNI-AVATAR
if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"hit_bone"') !== -1 || $response.body.indexOf('"fire_origin"') !== -1) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new RealityDistortionEngine().processPayload(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
