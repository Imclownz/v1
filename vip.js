/**
 * ==============================================================================
 * QUANTUM REACH v90: THE DEATH NOTE (NO-LIMIT ARCHITECTURE)
 * Concepts: Omnipresent Magic Bullet + Space-Time Decoupling + Hitscan Override + Nuke Compression
 * Status: ANNIHILATION - Bypassing all Engine physics and Server-Side limitations.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);

if (!_global.__QuantumState || _global.__QuantumState.version !== 90) {
    _global.__QuantumState = {
        version: 90,
        currentMatchId: null,
        currentPing: 40.0,
        target: { id: null, headPos: {x:0, y:0, z:0} }
    };
}

class DeathNoteEngine {
    cleanseMemory(newMatchId) {
        _global.__QuantumState.currentMatchId = newMatchId;
        _global.__QuantumState.target = { id: null, headPos: {x:0, y:0, z:0} };
    }

    processPayload(payload, isEventArray = false) {
        if (!payload || typeof payload !== 'object') return payload;

        // XỬ LÝ NHÂN BẢN GÓI TIN (NUKE COMPRESSION) NẾU LÀ MẢNG SỰ KIỆN
        if (Array.isArray(payload)) {
            let newPayload = [];
            for (let i = 0; i < payload.length; i++) {
                let processedItem = this.processPayload(payload[i]);
                newPayload.push(processedItem);
                
                // Kỹ thuật Nén Sát thương: Nhân bản gói tin sát thương lên 5 lần ngay trong hàng đợi
                if (processedItem.damage_report || processedItem.hit_event) {
                    for (let clone = 0; clone < 4; clone++) {
                        let clonedItem = JSON.parse(JSON.stringify(processedItem));
                        // Lùi timestamp của các bản clone đi 1ms để đánh lừa Anti-Spam
                        if (clonedItem.client_timestamp) clonedItem.client_timestamp -= (clone + 1);
                        newPayload.push(clonedItem);
                    }
                }
            }
            return newPayload;
        }

        // CẬP NHẬT TRẠNG THÁI CƠ BẢN
        if (payload.ping !== undefined) _global.__QuantumState.currentPing = payload.ping;
        if (payload.match_id !== undefined && payload.match_id !== _global.__QuantumState.currentMatchId) {
            this.cleanseMemory(payload.match_id);
        }

        // 1. ABSOLUTE HITSCAN OVERRIDE (Ép mọi vũ khí thành Tia Laser)
        if (payload.weapon) {
            payload.weapon.type = "HITSCAN";
            payload.weapon.bullet_speed = 999999.0; // Vận tốc ánh sáng, Flight Time = 0
            payload.weapon.recoil_accumulation = 0.0;
            payload.weapon.progressive_spread = 0.0;
        }

        // TÌM KẺ XẤU SỐ
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
                _global.__QuantumState.target.headPos = bestTarget.head_pos;
            }
        }

        // 2 & 3. OMNIPRESENT MAGIC BULLET + SPACE-TIME DECOUPLING
        if (payload.damage_report || payload.hit_event || payload.fire_event) {
            if (_global.__QuantumState.target.id && _global.__QuantumState.target.headPos) {
                
                payload.target_id = _global.__QuantumState.target.id;
                if (payload.hit_bone !== undefined) payload.hit_bone = 8; // Head
                if (payload.is_headshot !== undefined) payload.is_headshot = true;
                if (payload.ignore_armor !== undefined) payload.ignore_armor = true;

                const head = _global.__QuantumState.target.headPos;

                // Tịnh tiến điểm xuất phát đạn (Origin) đến cách não địch 0.01m. Xóa bỏ mọi vật cản.
                if (payload.fire_origin) {
                    payload.fire_origin = { x: head.x + 0.01, y: head.y, z: head.z + 0.01 };
                }
                if (payload.attacker_pos) {
                    payload.attacker_pos = { x: head.x + 0.01, y: head.y, z: head.z + 0.01 };
                }

                // Điểm chạm chính xác là Lõi não
                if (payload.hit_pos) {
                    payload.hit_pos = { x: head.x, y: head.y, z: head.z };
                }

                // Vector ngắm được ép hoàn hảo theo đường thẳng 0.01m đó
                if (payload.aim_pitch !== undefined) payload.aim_pitch = 0.0;
                if (payload.aim_yaw !== undefined) payload.aim_yaw = 0.0;

                // Tách rời Không-Thời gian: Đạn bắn ở não địch hiện tại, nhưng timestamp là ở quá khứ
                if (payload.client_timestamp !== undefined) {
                    payload.client_timestamp -= (_global.__QuantumState.currentPing + 25.0);
                }
            }
        }

        // Định tuyến quy đệ quy tìm kiếm mảng events/messages
        const rootKeys = ['data', 'events', 'payload', 'messages'];
        for (let i = 0; i < rootKeys.length; i++) {
            const key = rootKeys[i];
            if (payload[key]) {
                payload[key] = this.processPayload(payload[key], Array.isArray(payload[key]));
            }
        }

        return payload;
    }
}

// BỘ KÍCH HOẠT (TRIGGER BLOCK)
if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.includes('"players"') || $response.body.includes('"hit_bone"') || $response.body.includes('"fire_event"')) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new DeathNoteEngine().processPayload(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
