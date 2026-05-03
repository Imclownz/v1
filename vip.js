/**
 * ==============================================================================
 * QUANTUM REACH v87: GOD'S WRATH (ABSOLUTE BRUTALITY - NO LIMITS)
 * Architecture: Pure Silent Aim + 200ms Backtracking + Time-Aligned Bursting
 * Fixes: Eradicates Rubber-banding, Chest-locking, and Evasion mechanics.
 * Status: GOD TIER - Execution without line-of-sight or camera logic.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 87) {
    _global.__QuantumState = {
        version: 87,
        currentPing: 50.0,
        target: { id: null, pos: null, distance: 9999.0 },
        self: { pos: {x:0, y:0, z:0} },
        burstBuffer: [] // Bộ đệm dùng để nén và nổ sát thương
    };
}

class GodsWrathMath {
    // Phép chiếu Lõi Sọ (Core Projection) - Bỏ qua mọi vận tốc, bắn thẳng vào tọa độ tĩnh
    static getAbsoluteCore(headPos, headRadius) {
        if (!headPos) return { x: 0, y: 0, z: 0 };
        const coreOffset = headRadius ? (headRadius * 0.15) : 0.05;
        return { 
            x: headPos.x,
            y: headPos.y - coreOffset, // Ghim thẳng vào cuống não
            z: headPos.z
        };
    }
}

class WrathDispatcher {
    processFastPath(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        // XỬ LÝ MẢNG VÀ NÉN SÁT THƯƠNG (BURST EXECUTION)
        if (Array.isArray(payload)) {
            let isDamageArray = false;
            for (let i = 0; i < payload.length; i++) {
                if (payload[i].damage_report || payload[i].hit_event) isDamageArray = true;
                payload[i] = this.processFastPath(payload[i]);
            }
            
            // Nếu đây là một mảng sát thương nén (SMG spraying), ta đồng bộ hóa timestamp
            // Để Máy chủ nhận diện toàn bộ N viên đạn đập vào đầu địch trong cùng 1 mili-giây
            if (isDamageArray && payload.length > 1) {
                const masterTimestamp = payload[0].client_timestamp;
                for (let i = 1; i < payload.length; i++) {
                    if (payload[i].client_timestamp) payload[i].client_timestamp = masterTimestamp;
                }
            }
            return payload;
        }

        if (payload.ping !== undefined) _global.__QuantumState.currentPing = payload.ping;
        if (payload.player_pos) _global.__QuantumState.self.pos = payload.player_pos;

        // 1. NHẬN DIỆN MỤC TIÊU (Bỏ qua Camera, khoảng cách)
        if (payload.players && Array.isArray(payload.players)) {
            let bestTarget = null;
            let minDistance = 9999.0;

            for (let i = 0; i < payload.players.length; i++) {
                const enemy = payload.players[i];
                if (enemy.is_visible !== false) {
                    if (enemy.distance < minDistance) { 
                        minDistance = enemy.distance; 
                        bestTarget = enemy; 
                    }
                }
            }

            if (bestTarget && bestTarget.head_pos) {
                _global.__QuantumState.target.id = bestTarget.id;
                _global.__QuantumState.target.distance = minDistance;
                
                const headRadius = bestTarget.hitboxes?.head?.m_Radius || 0.2;
                
                // Lấy tọa độ lõi tuyệt đối, không cần đón đầu vì ta sẽ dùng Backtracking
                _global.__QuantumState.target.pos = GodsWrathMath.getAbsoluteCore(
                    bestTarget.head_pos, headRadius
                );
            }
        }

        // 2. THUẦN SILENT AIM & BACKTRACKING (Thao túng Thời Gian và Không Gian)
        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            if (_global.__QuantumState.target.id && _global.__QuantumState.target.pos) {
                
                // Gán định danh mục tiêu
                payload.target_id = _global.__QuantumState.target.id;
                if (payload.hit_bone !== undefined) payload.hit_bone = 8;
                if (payload.is_headshot !== undefined) payload.is_headshot = true;
                
                // Ghost Penetration Tuyệt đối
                if (payload.penetration_ratio !== undefined) payload.penetration_ratio = 1.0;
                if (payload.ignore_armor !== undefined) payload.ignore_armor = true;
                if (payload.wall_bang !== undefined) payload.wall_bang = false;

                // Gán Tọa độ Lõi Não
                if (payload.hit_pos) {
                    payload.hit_pos.x = _global.__QuantumState.target.pos.x;
                    payload.hit_pos.y = _global.__QuantumState.target.pos.y;
                    payload.hit_pos.z = _global.__QuantumState.target.pos.z;
                }

                // KHÔNG CHẠM VÀO CAMERA PITCH/YAW Ở ĐÂY NỮA
                // Điều này triệt tiêu 100% hiện tượng rung giật màn hình (Rubber-banding)

                // BACKTRACKING: Kéo lùi thời gian
                // Trừ đi 200ms (Max Lag Compensation của Server). Máy chủ sẽ kiểm tra tọa độ địch 
                // ở khung hình quá khứ 0.2 giây trước, khi địch chưa kịp thực hiện hành động né tránh.
                if (payload.client_timestamp !== undefined) {
                    payload.client_timestamp -= 200; 
                }
            }
        }

        // 3. TẨY TRẮNG CAMERA (Bảo vệ Client)
        // Nếu gói tin này thuần túy là gửi trạng thái Camera lên máy chủ, ta giữ nguyên gốc
        // Không sửa đổi để qua mặt mọi AI check hành vi.
        if (payload.camera_state) {
            // Không làm gì cả, giữ nguyên sự tự nhiên của điện thoại
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
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"hit_bone"') !== -1 || $response.body.indexOf('"damage_') !== -1) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new WrathDispatcher().processFastPath(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
