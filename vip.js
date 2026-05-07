/**
 * ==============================================================================
 * PROJECT: OMNI-MATRIX (BI-CORE WEAPON ARCHITECTURE)
 * Base Framework: Synchronized Pipeline & Weapon Classification
 * Supported Cores: CORE 1 (Shotgun) | CORE 2 (SMG/AR)
 * Ignored: Snipers, Melee, Throwables.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);

// 1. GLOBAL STATE (Bộ nhớ dùng chung đồng bộ hóa toàn hệ thống)
if (!_global.__OmniState || _global.__OmniState.version !== "MATRIX_BASE") {
    _global.__OmniState = {
        version: "MATRIX_BASE",
        currentPing: 50.0,
        activeCore: "NONE", // 'SHOTGUN', 'AUTO', hoặc 'IGNORE'
        target: { id: null, pos: null, distance: 9999.0 },
        self: { pos: {x:0, y:0, z:0}, anchorPos: {x:0, y:0, z:0} },
        weapon: { isFiring: false, id: "", category: "" }
    };
}

// ============================================================================
// MODULE 1: HỆ THỐNG PHÂN LOẠI VŨ KHÍ (WEAPON CLASSIFIER)
// ============================================================================
class WeaponClassifier {
    static identify(weaponData) {
        if (!weaponData) return "NONE";
        
        const id = (weaponData.id || "").toUpperCase();
        const category = (weaponData.category || "").toUpperCase();

        // 1. LOẠI BỎ SÚNG NGẮM VÀ VŨ KHÍ RÁC
        const ignoredWeapons = ["AWM", "KAR98K", "M82B", "TREATMENT", "CROSSBOW"];
        if (category === "SNIPER" || category === "MELEE" || ignoredWeapons.includes(id)) {
            return "IGNORE";
        }

        // 2. NHẬN DIỆN SHOTGUN (Cận chiến thô bạo)
        const shotgunIDs = ["M1887", "M1014", "SPAS12", "MAG7", "CHARGE", "TROS"];
        if (category === "SHOTGUN" || shotgunIDs.includes(id)) {
            return "SHOTGUN";
        }

        // 3. NHẬN DIỆN SMG / AR (Sấy liên thanh)
        const autoCategories = ["SMG", "AR", "LMG", "MACHINEGUN"];
        if (autoCategories.includes(category) || weaponData.is_automatic) {
            return "AUTO";
        }

        return "AUTO"; // Mặc định các súng bắn đạn còn lại đưa về Lõi Auto
    }
}

// ============================================================================
// ============================================================================
// MODULE 2: LÕI SHOTGUN (POINT-BLANK CONVERGENCE & OMNI-AVATAR)
// Dành cho M1887, M1014, Spas12, MAG-7, Charge Buster...
// ============================================================================
class ShotgunCore {
    static execute(payload) {
        
        // 1. Z-AXIS NULLIFICATION & XÓA BỎ TỪ TÍNH (TRUE pSILENT)
        if (payload.players && Array.isArray(payload.players)) {
            let bestTarget = null;
            let minDistance = 9999.0;

            for (let i = 0; i < payload.players.length; i++) {
                const enemy = payload.players[i];

                // ĐÓNG BĂNG TRỤC Y: Cưỡng chế địch lơ lửng, nằm sấp, lộn nhào về trạng thái Đứng im.
                if (enemy.stance !== undefined) enemy.stance = "STANDING";
                if (enemy.pose_id !== undefined) enemy.pose_id = "STANDING";
                if (enemy.is_jumping !== undefined) enemy.is_jumping = false;
                if (enemy.in_air !== undefined) enemy.in_air = false;

                // XÓA SỔ TỪ TÍNH: Shotgun không cần lướt tâm, tránh làm rung màn hình khi Jump-shot
                if (enemy.hitboxes) {
                    const allParts = ['head', 'chest', 'spine', 'pelvis', 'left_arm', 'right_arm', 'left_leg', 'right_leg', 'neck'];
                    allParts.forEach(part => {
                        if (enemy.hitboxes[part]) {
                            enemy.hitboxes[part].priority = "IGNORE";
                            enemy.hitboxes[part].friction = 0.0;
                            enemy.hitboxes[part].magnetism = 0.0;
                            enemy.hitboxes[part].snap_weight = -9999.0;
                        }
                    });
                }

                if (enemy.is_visible !== false && enemy.occluded !== true) {
                    if (enemy.distance < minDistance) {
                        minDistance = enemy.distance;
                        bestTarget = enemy;
                    }
                }
            }

            if (bestTarget && bestTarget.head_pos) {
                _global.__OmniState.target.id = bestTarget.id;
                
                // Khóa cứng chiều cao đầu (chống trượt khi địch nhảy)
                _global.__OmniState.target.pos = { 
                    x: bestTarget.head_pos.x,
                    y: bestTarget.head_pos.y - 0.1, // Hạ nhẹ 10cm vào yết hầu để gom chùm hạt đạn Shotgun
                    z: bestTarget.head_pos.z 
                };

                // BẢO VỆ THỊ GIÁC: Nghiêm cấm Server/Script giật màn hình của Client
                if (payload.camera_state) {
                    delete payload.camera_state.target_x;
                    delete payload.camera_state.target_y;
                    delete payload.camera_state.target_z;
                    delete payload.camera_state.interpolation;
                }
            }
        }

        // 2. OMNI-AVATAR SPOOFING & POINT-BLANK CONVERGENCE (PHÂN THÂN & HỘI TỤ ĐẠN)
        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            if (_global.__OmniState.target.id && _global.__OmniState.target.pos && _global.__OmniState.weapon.isFiring) {
                
                const targetHead = _global.__OmniState.target.pos;

                // Cưỡng chế Gói tin báo Sát thương Đầu tối đa
                payload.target_id = _global.__OmniState.target.id;
                payload.hit_bone = 8;
                payload.is_headshot = true;
                if (payload.ignore_armor !== undefined) payload.ignore_armor = true;

                // DỊCH CHUYỂN NÒNG SÚNG (POINT-BLANK)
                // Đặt nòng súng vào sâu 1cm bên trong sọ địch -> Khoảng cách bay = 0, toàn bộ hạt đạn tụ thành 1 điểm.
                if (payload.fire_origin !== undefined) {
                    payload.fire_origin.x = targetHead.x;
                    payload.fire_origin.y = targetHead.y;
                    payload.fire_origin.z = targetHead.z - 0.01; 
                }

                // DỊCH CHUYỂN BẢN THỂ (OMNI-AVATAR)
                // Lừa Server rằng "Tôi đang đứng ngay trước mặt nó để bóp cò, không phải từ xa"
                if (payload.attacker_pos !== undefined) {
                    payload.attacker_pos.x = targetHead.x;
                    payload.attacker_pos.y = targetHead.y;
                    payload.attacker_pos.z = targetHead.z - 0.02;
                }

                // GOM CHÙM ĐẠN VÀO LÕI
                if (payload.hit_pos !== undefined) {
                    payload.hit_pos = { ...targetHead };
                }

                // BẺ CÔNG VECTOR NGẮM NGẦM
                // Dù màn hình bạn chĩa xuống đất, hệ thống báo lên Server là bạn đang chĩa súng thẳng ngang đầu địch.
                if (payload.aim_pitch !== undefined) payload.aim_pitch = 0.0; // Bắn ngang hoàn toàn (vì đang đứng cùng độ cao)
                
                // Đồng bộ hóa Vector Yaw lừa hệ thống Anti-Cheat
                if (payload.aim_yaw !== undefined) {
                    const dx = targetHead.x - _global.__OmniState.self.anchorPos.x;
                    const dz = targetHead.z - _global.__OmniState.self.anchorPos.z;
                    payload.aim_yaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
                }
            }
        }

        return payload;
    }
}
============================================================================
============================================================================
// MODULE 3: LÕI SMG/AR (DYNAMIC ROUTING & TRUE pSILENT BACKTRACK)
// Dành cho M4A1, MP40, SCAR, UMP, Groza... (Bắn liên thanh)
// ============================================================================
class AutoCore {
    static execute(payload) {
        
        // 1. TÌM MỤC TIÊU VÀ DYNAMIC ROUTING (Phân loại khoảng cách)
        if (payload.players && Array.isArray(payload.players)) {
            let bestTarget = null;
            let minDistance = 9999.0;

            for (let i = 0; i < payload.players.length; i++) {
                const enemy = payload.players[i];

                // BÌNH CHUẨN HÓA TƯ THẾ (Áp dụng cho mọi khoảng cách)
                if (enemy.stance !== undefined) enemy.stance = "STANDING";
                if (enemy.pose_id !== undefined) enemy.pose_id = "STANDING";

                // QUẢN LÝ TỪ TÍNH THEO KHOẢNG CÁCH (DYNAMIC ROUTING)
                if (enemy.hitboxes) {
                    const allParts = ['chest', 'spine', 'pelvis', 'left_arm', 'right_arm', 'left_leg', 'right_leg', 'neck'];
                    // Luôn dọn dẹp lực cản thân người để tâm không bị kẹt ở bụng
                    allParts.forEach(part => {
                        if (enemy.hitboxes[part]) {
                            enemy.hitboxes[part].priority = "IGNORE";
                            enemy.hitboxes[part].friction = 0.0;
                            enemy.hitboxes[part].magnetism = 0.0;
                        }
                    });

                    // BÃO TỪ TÍNH CẬN/TRUNG CHIẾN: Ép Aim-Assist tự lướt tâm
                    if (enemy.hitboxes['head'] && enemy.distance <= 30.0) {
                        enemy.hitboxes['head'].priority = "ABSOLUTE";
                        enemy.hitboxes['head'].magnetism = 9999.0;
                        enemy.hitboxes['head'].friction = 9999.0;
                        enemy.hitboxes['head'].snap_weight = 9999.0;
                        enemy.hitboxes['head'].radius = 50.0; // Phóng to FOV lên cả màn hình
                    } 
                    // CỰ LY XA: Trả về tự nhiên để áp dụng pSilent ngắm ngầm
                    else if (enemy.hitboxes['head'] && enemy.distance > 30.0) {
                        enemy.hitboxes['head'].priority = "NORMAL";
                        enemy.hitboxes['head'].magnetism = 1.0;
                    }
                }

                if (enemy.is_visible !== false && enemy.occluded !== true) {
                    if (enemy.distance < minDistance) {
                        minDistance = enemy.distance;
                        bestTarget = enemy;
                    }
                }
            }

            // GHI NHẬN MỤC TIÊU VÀ TÍNH TOÁN VECTOR NGHỊCH ĐẢO
            if (bestTarget && bestTarget.head_pos) {
                _global.__OmniState.target.id = bestTarget.id;
                _global.__OmniState.target.distance = minDistance;
                _global.__OmniState.target.pos = { ...bestTarget.head_pos };
                
                // Toán học Nghịch đảo (Tính trước Vector để dành cho pSilent)
                const dx = bestTarget.head_pos.x - _global.__OmniState.self.anchorPos.x;
                const dy = bestTarget.head_pos.y - _global.__OmniState.self.anchorPos.y;
                const dz = bestTarget.head_pos.z - _global.__OmniState.self.anchorPos.z;
                const distXZ = Math.sqrt(dx * dx + dz * dz);
                
                let yaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
                let pitch = Math.atan2(-dy, distXZ) * (180.0 / Math.PI);

                // Khử độ giật và Nở tâm (Được cập nhật liên tục khi sấy)
                const recoilY = _global.__OmniState.weapon.isFiring ? 0.05 : 0.0; // Giả lập mức giật
                const spreadX = _global.__OmniState.weapon.isFiring ? 0.02 : 0.0;
                
                _global.__OmniState.vector = { 
                    pitch: pitch - recoilY, 
                    yaw: yaw - spreadX 
                };

                // Trả Camera lại cho Client để tự động Tracking (Không ép ZERO)
                if (payload.camera_state) {
                    delete payload.camera_state.target_x;
                    delete payload.camera_state.target_y;
                    delete payload.camera_state.target_z;
                    delete payload.camera_state.interpolation;
                }
            }
        }

        // 2. NÉN THẨM QUYỀN ĐỘ GIẬT TRÊN CLIENT
        if (payload.weapon && _global.__OmniState.weapon.isFiring) {
            // "Xóa" độ giật một cách an toàn bằng cách nén nó xuống mức cực thấp (chống Ban)
            if (payload.weapon.recoil_accumulation) payload.weapon.recoil_accumulation *= 0.05;
            if (payload.weapon.progressive_spread) payload.weapon.progressive_spread *= 0.05;
        }

        // 3. ĐẠN ĐẠO TÀNG HÌNH & HÀNH QUYẾT QUÁ KHỨ (pSILENT & BACKTRACK)
        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            if (_global.__OmniState.target.id && _global.__OmniState.target.pos) {
                
                // Ép sát thương Đầu
                payload.target_id = _global.__OmniState.target.id;
                payload.hit_bone = 8;
                payload.is_headshot = true;
                if (payload.ignore_armor !== undefined) payload.ignore_armor = true;

                // TIÊM VECTOR NGHỊCH ĐẢO (TRUE pSILENT)
                // Kể cả khi sấy từ xa màn hình rung, Vector tia đạn luôn bị bẻ cong găm thẳng sọ
                if (payload.aim_pitch !== undefined && _global.__OmniState.vector) payload.aim_pitch = _global.__OmniState.vector.pitch;
                if (payload.aim_yaw !== undefined && _global.__OmniState.vector) payload.aim_yaw = _global.__OmniState.vector.yaw;

                // ABSOLUTE BACKTRACKING (Dành cho sấy liên thanh địch chạy ngang)
                if (payload.client_timestamp !== undefined) {
                    // Lùi thời gian sâu: Ping + 200ms độ trễ để bắt gọn cái bóng quá khứ
                    payload.client_timestamp -= (_global.__OmniState.currentPing + 200.0);
                }

                // TELESCOPIC BARREL (Tùy biến cự ly xa)
                // Kéo nòng súng bay qua không gian, nhưng luôn giữ khoảng cách an toàn (0.5m) để không bị Server đánh cờ Teleport
                if (payload.fire_origin !== undefined) {
                    const safetyMargin = 0.5; 
                    if (_global.__OmniState.target.distance > safetyMargin) {
                        const origin = _global.__OmniState.self.anchorPos;
                        const target = _global.__OmniState.target.pos; 
                        const ratio = (_global.__OmniState.target.distance - safetyMargin) / _global.__OmniState.target.distance;
                        
                        payload.fire_origin.x = origin.x + (target.x - origin.x) * ratio;
                        payload.fire_origin.y = origin.y + (target.y - origin.y) * ratio;
                        payload.fire_origin.z = origin.z + (target.z - origin.z) * ratio;
                    }
                }
                
                // Đồng bộ điểm va chạm
                if (payload.hit_pos !== undefined) {
                    payload.hit_pos = { ..._global.__OmniState.target.pos };
                }
            }
        }

        return payload;
    }
}
============================================================================
// MODULE MAIN: ĐỘNG CƠ ĐIỀU PHỐI ĐỒNG BỘ (MATRIX DISPATCHER)
// ============================================================================
class MatrixDispatcher {
    processPayload(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        // Xử lý mảng đệ quy cực nhanh
        if (Array.isArray(payload)) {
            for (let i = 0; i < payload.length; i++) payload[i] = this.processPayload(payload[i]);
            return payload;
        }

        // BƯỚC 1: ĐỒNG BỘ HÓA MÔI TRƯỜNG TỔNG (Chạy trước mọi thuật toán)
        if (payload.ping !== undefined) {
            _global.__OmniState.currentPing = (_global.__OmniState.currentPing * 0.7) + (payload.ping * 0.3);
        }
        if (payload.player_pos) {
            _global.__OmniState.self.anchorPos = { ..._global.__OmniState.self.pos };
            _global.__OmniState.self.pos = payload.player_pos;
        }

        // BƯỚC 2: CẬP NHẬT TRẠNG THÁI VŨ KHÍ & PHÂN LUỒNG
        if (payload.weapon) {
            _global.__OmniState.weapon.isFiring = !!(payload.weapon.is_firing || payload.weapon.recoil_accumulation > 0);
            _global.__OmniState.weapon.id = payload.weapon.id;
            _global.__OmniState.weapon.category = payload.weapon.category;
            
            // Gọi AI Phân loại súng
            _global.__OmniState.activeCore = WeaponClassifier.identify(payload.weapon);
        }

        // BƯỚC 3: KÍCH HOẠT LÕI TƯƠNG ỨNG (Trọng tâm giao tranh)
        // Nếu súng bị bỏ qua (Sniper) hoặc không rõ, trả nguyên payload về game
        if (_global.__OmniState.activeCore === "IGNORE" || _global.__OmniState.activeCore === "NONE") {
            // Định tuyến tiếp xuống dưới mà không can thiệp sát thương
        } 
        // Nếu là Shotgun -> Chạy thuật toán Shotgun
        else if (_global.__OmniState.activeCore === "SHOTGUN") {
            payload = ShotgunCore.execute(payload);
        } 
        // Nếu là SMG/AR -> Chạy thuật toán Auto
        else if (_global.__OmniState.activeCore === "AUTO") {
            payload = AutoCore.execute(payload);
        }

        // Định tuyến đệ quy tìm các node con
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

// BỘ KÍCH HOẠT CHÍNH CỦA SHADOWROCKET
if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"hit_bone"') !== -1 || $response.body.indexOf('"weapon"') !== -1) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new MatrixDispatcher().processPayload(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
