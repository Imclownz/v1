/**
 * ==============================================================================
 * PROJECT: OMNI-MATRIX V2.3 (PERFECT PIPELINE ARCHITECTURE)
 * Pipeline: Sanitizer -> M1(Gun) -> M4(Eyes) -> M7(Camera) -> TriggerCheck -> M5(Stance) -> M2/3/6(Physics) -> M8(Magic)
 * Status: Framework initialized. Modules pending deployment.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);

// ============================================================================
// 0. GLOBAL STATE (BỘ NHỚ DÙNG CHUNG ĐỒNG BỘ TỔNG V2.3)
// ============================================================================
if (!_global.__OmniState || _global.__OmniState.version !== "MATRIX_V2.3") {
    _global.__OmniState = {
        version: "MATRIX_V2.3",
        currentPing: 50.0,
        weaponProfile: { Core: "IGNORE", RequireZeroVelocity: false },
        
        target: { id: null, pos: null, predicted_pos: null, distance: 9999.0 },
        self: { pos: {x:0, y:0, z:0}, anchorPos: {x:0, y:0, z:0}, vel: {x:0, y:0, z:0}, isPerfectlyStill: false, anchoredFireOrigin: null },
        
        // Bổ sung triggerFired để giao tiếp giữa M6_TriggerCheck và M5
        weapon: { isFiring: false, id: "", category: "", triggerFired: false }, 
        
        tracker: {}, 
        
        camera: {
            lastTime: Date.now(),
            integralYaw: 0.0,
            integralPitch: 0.0,
            prevErrorYaw: 0.0,
            prevErrorPitch: 0.0
        }
    };
}

// ============================================================================
// VỎ BỌC CÁC MODULE (SẼ ĐƯỢC ĐỔ CODE VÀO CÁC BƯỚC TIẾP THEO)
// LƯU Ý: Không xóa các class rỗng này, chúng giữ vai trò định hình scope.
// ============================================================================
// ============================================================================
// MODULE 1: WEAPON CLASSIFIER (LÕI NHẬN DIỆN VŨ KHÍ)
// Nhiệm vụ: Phân tích siêu dữ liệu súng, quyết định kích hoạt Lõi Sát Thương nào
// và thiết lập cờ vận tốc (RequireZeroVelocity) cho TriggerBot.
// ============================================================================
class WeaponClassifier {
    
    // Thuật toán nhận diện dựa trên ID, Tên và Danh mục (Category)
    static classify(weaponData) {
        let profile = { 
            Core: "IGNORE", 
            RequireZeroVelocity: false 
        };
        
        if (!weaponData) return profile;

        // Ép kiểu về Chuỗi IN HOA để chống lỗi phân biệt hoa/thường từ Server
        const id = (weaponData.id || "").toString().toUpperCase();
        const name = (weaponData.name || "").toString().toUpperCase();
        const category = (weaponData.category || "").toString().toUpperCase();

        // Gộp chung thành một chuỗi nhận dạng để quét bằng từ khóa
        const identifier = `${id}_${name}_${category}`;

        // 1. NHÓM SHOTGUN (Kích hoạt Module 2: Gom tia Laser)
        if (identifier.includes("SHOTGUN") || identifier.includes("M1887") || 
            identifier.includes("M1014") || identifier.includes("SPAS") || 
            identifier.includes("MAG-7") || identifier.includes("TROGON") || identifier.includes("CHARGE")) {
            profile.Core = "SHOTGUN";
        } 
        
        // 2. NHÓM ONE-TAP / SNIPER (Kích hoạt Module 6: TriggerBot)
        else if (identifier.includes("SNIPER") || identifier.includes("PISTOL") || 
                 identifier.includes("DESERT_EAGLE") || identifier.includes("WOODPECKER") || 
                 identifier.includes("SVD") || identifier.includes("AC80") || 
                 identifier.includes("AWM") || identifier.includes("M82B") || identifier.includes("KAR98")) {
            profile.Core = "ONETAP";
            // Kích hoạt cờ này để báo cho M5 biết: Bắt buộc phải đóng băng vận tốc
            // trước khi cho phép M6 tự động bóp cò.
            profile.RequireZeroVelocity = true; 
        } 
        
        // 3. NHÓM AUTO / SMG / AR (Kích hoạt Module 3: Khóa chặt luồng đạn)
        else if (identifier.includes("SMG") || identifier.includes("AR") || 
                 identifier.includes("MACHINE") || identifier.includes("LMG") || 
                 identifier.includes("MP40") || identifier.includes("UMP") || 
                 identifier.includes("AK") || identifier.includes("SCAR") || 
                 identifier.includes("GROZA") || identifier.includes("FAMAS")) {
            profile.Core = "AUTO";
        }

        // Lưu ý: Nếu cầm Lựu Đạn, Đao, Machete, Keo, biến identifier sẽ không khớp
        // với bất kỳ từ khóa nào ở trên -> Trả về "IGNORE" (Bỏ qua can thiệp).
        return profile;
    }

    static processWeaponState(payload) {
        const weaponState = _global.__OmniState.weapon;

        // Trích xuất và đồng bộ trạng thái bóp cò
        // (Free Fire có thể gửi cờ is_firing ở ngoài root hoặc bên trong object weapon)
        if (payload.is_firing !== undefined) {
            weaponState.isFiring = payload.is_firing;
        }

        if (payload.weapon) {
            if (payload.weapon.is_firing !== undefined) {
                weaponState.isFiring = payload.weapon.is_firing;
            }
            
            // Nếu có sự thay đổi vũ khí (đổi súng), cập nhật ngay Profile mới
            if (payload.weapon.id !== undefined && payload.weapon.id !== weaponState.id) {
                weaponState.id = payload.weapon.id;
                weaponState.category = payload.weapon.category || "";
                
                // Chạy thuật toán phân loại và lưu Profile vào Bộ nhớ Tổng
                _global.__OmniState.weaponProfile = this.classify(payload.weapon);
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 4: TARGET KINEMATICS (LÕI ĐỘNG HỌC MỤC TIÊU - SNAP-AIM SYNC)
// Bản chất: Giải phóng FOV cho 360-ChainKill, Xóa bỏ ngoại suy tương lai ảo.
// Chỉ giữ lại Giao thức Bù trễ mạng (Ping Compensation) để đồng bộ Máy chủ.
// ============================================================================
class TargetKinematics {
    static processTargetState(payload) {
        // 1. CẬP NHẬT TỌA ĐỘ BẢN THÂN
        if (payload.anchorPos !== undefined) {
            _global.__OmniState.self.anchorPos = { ...payload.anchorPos };
        } else if (payload.pos !== undefined && _global.__OmniState.self.anchorPos.x === 0) {
            _global.__OmniState.self.anchorPos = { ...payload.pos };
        }

        if (!payload || !payload.players || !Array.isArray(payload.players)) return payload;

        const selfState = _global.__OmniState.self;
        if (!selfState.anchorPos || selfState.anchorPos.x === 0) return payload; 

        let bestTarget = null;
        let lowestThreatScore = 999999.0;
        
        // ====================================================================
        // 2. OMNIDIRECTIONAL THREAT-MATRIX (Ma trận Sát thủ 360 Độ)
        // ====================================================================
        for (let i = 0; i < payload.players.length; i++) {
            const enemy = payload.players[i];
            
            // Bỏ qua xác chết, đồng đội
            if (enemy.is_dead || enemy.hp <= 0 || enemy.is_knocked) continue;
            if (enemy.team_id !== undefined && enemy.team_id === _global.__OmniState.team_id) continue;
            if (!enemy.pos) continue;

            const dx = enemy.pos.x - selfState.anchorPos.x;
            const dy = enemy.pos.y - selfState.anchorPos.y;
            const dz = enemy.pos.z - selfState.anchorPos.z;
            const distance3D = Math.sqrt(dx*dx + dy*dy + dz*dz);

            // Bán kính quét tối đa: 300 mét
            if (distance3D > 300.0) continue;

            // LOẠI BỎ HÌNH PHẠT FOV: 
            // Vì M7 dùng Snap-Aim, màn hình có thể giật 180 độ trong 0ms.
            // Do đó, chúng ta KHÔNG quan tâm địch đứng ở góc nào. 
            // Ưu tiên tuyệt đối: Kẻ địch GẦN NHẤT và MÁU YẾU NHẤT.
            const hp = enemy.hp || 200.0;
            const hpWeight = ((enemy.max_hp || 200.0) - hp) * 1.5; // Kẻ yếu máu sẽ bị khóa trước
            
            let threatScore = distance3D - hpWeight;

            if (threatScore < lowestThreatScore) {
                lowestThreatScore = threatScore;
                bestTarget = enemy;
                bestTarget.distance = distance3D;
            }
        }

        // ====================================================================
        // 3. PING COMPENSATION (Bù Trừ Độ Trễ Mạng Cấp Máy Chủ)
        // ====================================================================
        if (bestTarget) {
            const targetState = _global.__OmniState.target;
            const tracker = _global.__OmniState.tracker;
            const currentTime = Date.now();

            targetState.id = bestTarget.id;
            targetState.distance = bestTarget.distance;
            
            // LUÔN KHÓA VÀO ĐẦU (Bone 8): 
            // Snap-Aim không sợ bị văng Camera, nên cứ khóa thẳng vào Lõi Sọ.
            let targetAimPos = bestTarget.pos;
            if (bestTarget.hitboxes && bestTarget.hitboxes.head) {
                targetAimPos = bestTarget.hitboxes.head.pos;
            } else {
                targetAimPos = { x: bestTarget.pos.x, y: bestTarget.pos.y + 1.6, z: bestTarget.pos.z };
            }
            
            targetState.pos = { ...targetAimPos };

            if (!tracker[bestTarget.id]) {
                tracker[bestTarget.id] = { 
                    lastPos: { ...targetAimPos }, 
                    lastTime: currentTime, 
                    velocity: {x:0, y:0, z:0}
                };
                targetState.predicted_pos = { ...targetAimPos }; 
            } 
            else {
                const history = tracker[bestTarget.id];
                let dt = (currentTime - history.lastTime) / 1000.0;
                
                if (dt > 0.0 && dt < 0.4) { 
                    // Tính Vận Tốc thực tại
                    let vx = (targetAimPos.x - history.lastPos.x) / dt;
                    let vy = (targetAimPos.y - history.lastPos.y) / dt;
                    let vz = (targetAimPos.z - history.lastPos.z) / dt;

                    // Giới hạn tốc độ ảo (Chống lỗi dịch chuyển tức thời của địch)
                    const speed = Math.sqrt(vx*vx + vy*vy + vz*vz);
                    if (speed > 25.0) {
                        vx = 0; vy = 0; vz = 0; // Địch lướt quá nhanh -> Khóa tĩnh
                    }

                    history.velocity = { x: vx, y: vy, z: vz };

                    // THUẬT TOÁN ĐỒNG BỘ: Chỉ bù đắp đúng khoảng thời gian Ping Delay.
                    // XÓA BỎ thời gian đạn bay (Bullet Speed) vì Snap-Aim + M8 sẽ kết liễu ngay lập tức.
                    let pingDelay = _global.__OmniState.currentPing / 1000.0;
                    
                    // Giới hạn trần Ping: Nếu Ping > 150ms, chỉ bù tối đa 0.15s để chống "Bắn ma"
                    if (pingDelay > 0.15) pingDelay = 0.15; 

                    let syncX = targetAimPos.x + (vx * pingDelay);
                    let syncY = targetAimPos.y + (vy * pingDelay);
                    let syncZ = targetAimPos.z + (vz * pingDelay);

                    // CHỐNG NHẢY NHẸ (Parabolic Gravity compensation cho Ping)
                    if (Math.abs(vy) > 1.5 && speed <= 25.0) {
                        syncY -= 0.5 * 9.8 * (pingDelay * pingDelay);
                    }

                    targetState.predicted_pos = { x: syncX, y: syncY, z: syncZ };
                } else {
                    targetState.predicted_pos = { ...targetAimPos };
                }

                history.lastPos = { ...targetAimPos };
                history.lastTime = currentTime;
            }
        } else {
            _global.__OmniState.target = { id: null, pos: null, predicted_pos: null, distance: 9999.0 };
        }

        return payload;
    }
}

// ============================================================================
// MODULE 7: CAMERA MANIPULATOR (LÕI ĐIỀU HƯỚNG - SNAP-AIM V4.0 TỐI THƯỢNG)
// Bản chất: Dịch chuyển góc nhìn tức thời (0ms). Tích hợp khóa chống rung (Anti-Jitter)
// và cưỡng chế Engine nội bộ để Server chấp nhận mọi pha quay xe 180 độ.
// ============================================================================
class CameraManipulator {
    
    // Chuẩn hóa góc quay về hệ trục [-180, 180] để Game Engine không bị tràn số
    static normalizeAngle(angle) {
        while (angle > 180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }

    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;
        const weaponState = _global.__OmniState.weapon;

        // Trả lại quyền điều khiển cho người chơi nếu không có mục tiêu
        if (!targetState.id || !targetState.predicted_pos || payload.aim_yaw === undefined) return payload;

        // ====================================================================
        // 1. TOÁN HỌC KHÔNG GIAN (VECTOR -> EULER ANGLES)
        // ====================================================================
        // Điểm đặt mắt của Camera thường cao hơn tọa độ gốc (gầm giày) 1.6 mét
        const origin = { 
            x: selfState.anchorPos.x, 
            y: selfState.anchorPos.y + 1.6, 
            z: selfState.anchorPos.z 
        };
        const dest = targetState.predicted_pos;

        const dx = dest.x - origin.x;
        const dy = dest.y - origin.y;
        const dz = dest.z - origin.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz);

        // Tính toán góc Euler nguyên thủy
        let targetYaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
        let targetPitch = Math.atan2(-dy, distXZ) * (180.0 / Math.PI);

        // ====================================================================
        // 2. PERFECT ZERO-RECOIL CAMERA (BÙ GIẬT TỨC THỜI)
        // ====================================================================
        // Trực tiếp trừ đi độ nảy của vũ khí để Camera luôn khóa chặt 1 điểm
        // ngay cả khi bạn đang sấy nguyên băng đạn súng trường.
        if (weaponState.isFiring && payload.weapon && payload.weapon.recoil_accumulation !== undefined) {
            targetPitch -= payload.weapon.recoil_accumulation; 
        }

        // ====================================================================
        // 3. BỘ LỌC CHỐNG RUNG (ANTI-JITTER FILTER)
        // ====================================================================
        const currentYaw = payload.aim_yaw;
        const currentPitch = payload.aim_pitch;

        let diffYaw = this.normalizeAngle(targetYaw - currentYaw);
        let diffPitch = this.normalizeAngle(targetPitch - currentPitch);

        // NGƯỠNG ĐÓNG BĂNG MÀN HÌNH (0.05 ĐỘ)
        // Nếu tâm súng đã nằm gọn trong não địch (sai số < 0.05 độ), từ chối cập nhật Camera.
        // Điều này giúp màn hình của bạn tĩnh lặng tuyệt đối, không bị rung bần bật 
        // vì những dao động thập phân siêu nhỏ từ Server.
        if (Math.abs(diffYaw) > 0.05) {
            payload.aim_yaw = this.normalizeAngle(currentYaw + diffYaw);
        }
        if (Math.abs(diffPitch) > 0.05) {
            payload.aim_pitch = this.normalizeAngle(currentPitch + diffPitch);
        }

        // ====================================================================
        // 4. GIAO THỨC CƯỠNG CHẾ ENGINE (SERVER DESYNC BYPASS)
        // ====================================================================
        if (payload.camera_state) {
            // Cập nhật góc nhìn vật lý
            payload.camera_state.yaw = payload.aim_yaw;
            payload.camera_state.pitch = payload.aim_pitch;
            
            // THỦ THUẬT RAGE MỚI: Vũ khí hóa 'target_xyz'
            // Thay vì xóa đi, chúng ta nhồi thẳng tọa độ Lõi Sọ vào biến Vector Focus của Engine.
            // Game sẽ hiểu rằng: "Không phải nó xoay chuột, mà nó đang khóa mục tiêu cứng vào tọa độ này".
            // Đảm bảo 100% không bao giờ bị Server bắt lỗi lệch góc (Camera Desync).
            payload.camera_state.target_x = dest.x;
            payload.camera_state.target_y = dest.y;
            payload.camera_state.target_z = dest.z;
        }

        return payload;
    }
}

// ============================================================================
// MODULE 3: AUTO CORE (LÕI SÁT THƯƠNG LIÊN THANH - V2.3)
// Nhiệm vụ: Xóa bỏ hoàn toàn độ giật và độ nở tâm cộng dồn. 
// Khóa chặt mọi viên đạn trong băng thành 1 tia Laser liên tục.
// ============================================================================
class AutoCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;

        // --------------------------------------------------------------------
        // 1. TRIỆT TIÊU VẬT LÝ SÚNG (ABSOLUTE STABILIZATION)
        // --------------------------------------------------------------------
        if (payload.weapon) {
            // Ép độ giật về 0 tuyệt đối (Không nảy lên, không rung ngang)
            if (payload.weapon.recoil_y !== undefined) payload.weapon.recoil_y = 0.0;
            if (payload.weapon.recoil_x !== undefined) payload.weapon.recoil_x = 0.0;
            if (payload.weapon.recoil_accumulation !== undefined) payload.weapon.recoil_accumulation = 0.0;
            
            // Ép độ nở hồng tâm về 0 (Đạn bay thẳng tắp dù sấy cạn cả băng)
            if (payload.weapon.base_spread !== undefined) payload.weapon.base_spread = 0.0;
            if (payload.weapon.dynamic_spread !== undefined) payload.weapon.dynamic_spread = 0.0;
            if (payload.weapon.max_spread !== undefined) payload.weapon.max_spread = 0.0;
            if (payload.weapon.spread_add_per_shot !== undefined) payload.weapon.spread_add_per_shot = 0.0;

            // Xóa bỏ sai số khi nhân vật đang di chuyển/nhảy/ngồi
            if (payload.weapon.inaccuracy_move !== undefined) payload.weapon.inaccuracy_move = 0.0;
            if (payload.weapon.inaccuracy_jump !== undefined) payload.weapon.inaccuracy_jump = 0.0;
            if (payload.weapon.inaccuracy_crouch !== undefined) payload.weapon.inaccuracy_crouch = 0.0;
        }

        // --------------------------------------------------------------------
        // 2. KHÓA CHẶT LUỒNG ĐẠN (BULLET STREAM SYNCHRONIZATION)
        // --------------------------------------------------------------------
        // Đối với súng Auto, Game Engine sẽ gửi mảng các viên đạn bắn ra trong mỗi Tick
        if (payload.bullet_events && Array.isArray(payload.bullet_events)) {
            
            // Chỉ can thiệp bẻ tia đạn nếu M4 (Mắt thần) đã khóa được tọa độ đầu
            if (targetState.id && targetState.predicted_pos && selfState.anchorPos) {
                
                const origin = selfState.anchorPos;
                const dest = targetState.predicted_pos;
                
                // Toán học Vector: Tính hướng đạn chuẩn xác
                let dx = dest.x - origin.x;
                let dy = dest.y - origin.y;
                let dz = dest.z - origin.z;
                const mag = Math.sqrt(dx*dx + dy*dy + dz*dz);
                const perfectDir = { x: dx/mag, y: dy/mag, z: dz/mag };

                // Ép TẤT CẢ các viên đạn đi theo đúng 1 đường thẳng tắp
                for (let i = 0; i < payload.bullet_events.length; i++) {
                    let bullet = payload.bullet_events[i];
                    
                    if (bullet.ray_dir) {
                        bullet.ray_dir = { ...perfectDir };
                    }
                    
                    // Gắn nhãn ID của kẻ địch vào viên đạn để Module 8 (Magic Bullet) dễ dàng chuyển hóa sát thương
                    bullet.target_id = targetState.id;
                }
            }
        }

        // --------------------------------------------------------------------
        // 3. TỐI ƯU HÓA SÁT THƯƠNG (DEADLY PENETRATION)
        // --------------------------------------------------------------------
        if (payload.damage_report) {
            // Mặc định ép mọi viên trúng sọ (Bone: 8)
            payload.damage_report.hit_bone = 8;
            payload.damage_report.is_headshot = true;

            // Bỏ qua giáp/mũ: SMG thường bị cản bởi Giáp 3, ép xuyên giáp tuyệt đối
            if (payload.damage_report.armor_penetration !== undefined) {
                payload.damage_report.armor_penetration = 1.0; 
            }

            // Xóa bỏ khoảng cách giảm sát thương (AR/SMG bắn xa không bị yếu)
            if (payload.damage_report.distance_penalty !== undefined) {
                payload.damage_report.distance_penalty = 0.0;
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE PHỤ TRỢ: TRIGGER CHECK (BẢN ÉP XUNG - ZERO DELAY)
// Bản chất: Vì M7 đã dùng Snap-Aim (Dịch chuyển tức thời), góc lệch luôn bằng 0.
// Bỏ qua mọi phép tính lượng giác rườm rà. Có mục tiêu là tự động khai hỏa.
// ============================================================================
class TriggerCheck {
    static evaluate(payload) {
        const targetState = _global.__OmniState.target;
        const weaponState = _global.__OmniState.weapon;
        const profile = _global.__OmniState.weaponProfile;

        // Xóa cờ Trigger của khung hình trước
        weaponState.triggerFired = false;

        // Chỉ Auto-Shoot cho dòng súng One-Tap (Sniper, Desert Eagle)
        if (profile.Core !== "ONETAP") return payload;

        // ĐIỀU KIỆN KÍCH HOẠT TỨC THỜI:
        // M4 đã khóa được ID địch, và M7 đã chèn góc Snap-Aim vào gói tin.
        if (targetState.id && targetState.predicted_pos && payload.aim_yaw !== undefined) {
            
            // ÉP XUNG: Ra lệnh nổ súng ngay trong frame hiện tại
            payload.is_firing = true;
            if (payload.weapon) {
                payload.weapon.is_firing = true;
            }
            
            // Gửi luồng điện báo hiệu trực tiếp cho M5 ở bên dưới
            weaponState.isFiring = true;
            weaponState.triggerFired = true; 
        }

        return payload;
    }
}

// ============================================================================
// MODULE 5: SELF KINEMATICS (LÕI ĐÓNG BĂNG - SNAP-AIM ABS)
// Bản chất: Đón nhận luồng điện từ TriggerCheck, lập tức đạp phanh đứng tấn
// để viên đạn bắn ra không bị dính bất kỳ sai số di chuyển nào.
// ============================================================================
class SelfKinematics {
    static processSelfState(payload) {
        const state = _global.__OmniState.self;
        const weaponState = _global.__OmniState.weapon;
        
        // Bắt tín hiệu khai hỏa (Độ trễ = 0 mili-giây)
        const isFiring = weaponState.isFiring || weaponState.triggerFired || payload.is_firing;

        // Cập nhật tọa độ dự phòng
        if (payload.pos !== undefined) state.pos = { ...payload.pos };
        if (payload.anchorPos !== undefined) state.anchorPos = { ...payload.anchorPos };

        // HỆ THỐNG PHANH KHẨN CẤP (ABS)
        if (isFiring) {
            // Lừa Máy chủ rằng bạn đang hoàn toàn đứng im trên mặt đất
            if (payload.velocity !== undefined) {
                payload.velocity.x = 0.0;
                payload.velocity.y = 0.0;
                payload.velocity.z = 0.0;
            }
            if (payload.speed !== undefined) payload.speed = 0.0;
            if (payload.is_airborne !== undefined) payload.is_airborne = false;
            if (payload.is_moving !== undefined) payload.is_moving = false;

            // Xóa rung lắc cơ thể (Body Sway)
            if (payload.body_sway !== undefined) payload.body_sway = 0.0;

            // Phát tín hiệu cho các Lõi Vật Lý biết bệ phóng đã an toàn
            state.isPerfectlyStill = true;

        } else {
            // Xả phanh khi ngừng bắn để nhân vật tiếp tục bay/nhảy mượt mà
            state.isPerfectlyStill = false;
        }

        return payload;
    }
}

// ============================================================================
// MODULE 2: SHOTGUN CORE (LÕI SÁT THƯƠNG CẬN CHIẾN - V2.3)
// Nhiệm vụ: Triệt tiêu nảy nòng, gom toàn bộ chùm đạn thành 1 tia Laser duy nhất,
// và xóa bỏ giới hạn giảm sát thương theo cự ly xa.
// ============================================================================
class ShotgunCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;

        // --------------------------------------------------------------------
        // 1. TRIỆT TIÊU ĐỘ GIẬT & ĐỘ NỞ TÂM VŨ KHÍ (ABSOLUTE ZERO)
        // --------------------------------------------------------------------
        if (payload.weapon) {
            // Xóa sổ độ giật (Recoil - Nảy nòng)
            if (payload.weapon.recoil_y !== undefined) payload.weapon.recoil_y = 0.0;
            if (payload.weapon.recoil_x !== undefined) payload.weapon.recoil_x = 0.0;
            if (payload.weapon.recoil_accumulation !== undefined) payload.weapon.recoil_accumulation = 0.0;
            
            // Xóa sổ độ nở tâm (Spread) - Đây là kẻ thù lớn nhất của Shotgun
            // Ép hồng tâm thu nhỏ lại bằng đầu kim
            if (payload.weapon.base_spread !== undefined) payload.weapon.base_spread = 0.0;
            if (payload.weapon.dynamic_spread !== undefined) payload.weapon.dynamic_spread = 0.0;
            if (payload.weapon.max_spread !== undefined) payload.weapon.max_spread = 0.0;
        }

        // --------------------------------------------------------------------
        // 2. GOM TIA ĐẠN (LASER PELLETS CONCENTRATION)
        // --------------------------------------------------------------------
        // Súng Shotgun bắn ra nhiều mảnh đạn (pellets) văng tứ tung. 
        // Vòng lặp này bắt từng mảnh đạn một và nắn thẳng chúng lại.
        if (payload.bullet_events && Array.isArray(payload.bullet_events)) {
            
            if (targetState.id && targetState.predicted_pos && selfState.anchorPos) {
                // Tính toán Vector hoàn hảo đâm thẳng vào Lõi Sọ tương lai
                const origin = selfState.anchorPos;
                const dest = targetState.predicted_pos;
                
                let dx = dest.x - origin.x;
                let dy = dest.y - origin.y;
                let dz = dest.z - origin.z;
                
                // Bình chuẩn hóa (Normalize) Vector hướng đạn
                const mag = Math.sqrt(dx*dx + dy*dy + dz*dz);
                const perfectDir = { x: dx/mag, y: dy/mag, z: dz/mag };

                for (let i = 0; i < payload.bullet_events.length; i++) {
                    let pellet = payload.bullet_events[i];
                    
                    // Cưỡng chế mọi mảnh đạn trong lần bóp cò bay song song tuyệt đối
                    if (pellet.ray_dir) {
                        pellet.ray_dir = { ...perfectDir };
                    }
                    
                    // Đính kèm ID nạn nhân để lát nữa M8 (Magic Bullet) bẻ cong dễ dàng hơn
                    pellet.target_id = targetState.id;
                }
            }
        }

        // --------------------------------------------------------------------
        // 3. XÓA BỎ GIỚI HẠN VẬT LÝ TẦM GẦN (POINT-BLANK OPTIMIZATION)
        // --------------------------------------------------------------------
        if (payload.damage_report) {
            // Xóa bỏ hình phạt cự ly (Damage Falloff)
            // Khẩu M1887 giờ đây bắn kẻ địch cách xa 60 mét vẫn gây sát thương như đang kề nòng vào ngực
            if (payload.damage_report.distance_penalty !== undefined) {
                payload.damage_report.distance_penalty = 0.0;
            }
            
            // Ép xuyên giáp tối đa cho từng mảnh đạn
            if (payload.damage_report.armor_penetration !== undefined) {
                payload.damage_report.armor_penetration = 1.0; // Tương đương 100% xuyên giáp
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 3: AUTO CORE (LÕI SÁT THƯƠNG LIÊN THANH - V2.3)
// Nhiệm vụ: Xóa bỏ hoàn toàn độ giật và độ nở tâm cộng dồn. 
// Khóa chặt mọi viên đạn trong băng thành 1 tia Laser liên tục.
// ============================================================================
class AutoCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;

        // --------------------------------------------------------------------
        // 1. TRIỆT TIÊU VẬT LÝ SÚNG (ABSOLUTE STABILIZATION)
        // --------------------------------------------------------------------
        if (payload.weapon) {
            // Ép độ giật về 0 tuyệt đối (Không nảy lên, không rung ngang)
            if (payload.weapon.recoil_y !== undefined) payload.weapon.recoil_y = 0.0;
            if (payload.weapon.recoil_x !== undefined) payload.weapon.recoil_x = 0.0;
            if (payload.weapon.recoil_accumulation !== undefined) payload.weapon.recoil_accumulation = 0.0;
            
            // Ép độ nở hồng tâm về 0 (Đạn bay thẳng tắp dù sấy cạn cả băng)
            if (payload.weapon.base_spread !== undefined) payload.weapon.base_spread = 0.0;
            if (payload.weapon.dynamic_spread !== undefined) payload.weapon.dynamic_spread = 0.0;
            if (payload.weapon.max_spread !== undefined) payload.weapon.max_spread = 0.0;
            if (payload.weapon.spread_add_per_shot !== undefined) payload.weapon.spread_add_per_shot = 0.0;

            // Xóa bỏ sai số khi nhân vật đang di chuyển/nhảy/ngồi
            if (payload.weapon.inaccuracy_move !== undefined) payload.weapon.inaccuracy_move = 0.0;
            if (payload.weapon.inaccuracy_jump !== undefined) payload.weapon.inaccuracy_jump = 0.0;
            if (payload.weapon.inaccuracy_crouch !== undefined) payload.weapon.inaccuracy_crouch = 0.0;
        }

        // --------------------------------------------------------------------
        // 2. KHÓA CHẶT LUỒNG ĐẠN (BULLET STREAM SYNCHRONIZATION)
        // --------------------------------------------------------------------
        // Đối với súng Auto, Game Engine sẽ gửi mảng các viên đạn bắn ra trong mỗi Tick
        if (payload.bullet_events && Array.isArray(payload.bullet_events)) {
            
            // Chỉ can thiệp bẻ tia đạn nếu M4 (Mắt thần) đã khóa được tọa độ đầu
            if (targetState.id && targetState.predicted_pos && selfState.anchorPos) {
                
                const origin = selfState.anchorPos;
                const dest = targetState.predicted_pos;
                
                // Toán học Vector: Tính hướng đạn chuẩn xác
                let dx = dest.x - origin.x;
                let dy = dest.y - origin.y;
                let dz = dest.z - origin.z;
                const mag = Math.sqrt(dx*dx + dy*dy + dz*dz);
                const perfectDir = { x: dx/mag, y: dy/mag, z: dz/mag };

                // Ép TẤT CẢ các viên đạn đi theo đúng 1 đường thẳng tắp
                for (let i = 0; i < payload.bullet_events.length; i++) {
                    let bullet = payload.bullet_events[i];
                    
                    if (bullet.ray_dir) {
                        bullet.ray_dir = { ...perfectDir };
                    }
                    
                    // Gắn nhãn ID của kẻ địch vào viên đạn để Module 8 (Magic Bullet) dễ dàng chuyển hóa sát thương
                    bullet.target_id = targetState.id;
                }
            }
        }

        // --------------------------------------------------------------------
        // 3. TỐI ƯU HÓA SÁT THƯƠNG (DEADLY PENETRATION)
        // --------------------------------------------------------------------
        if (payload.damage_report) {
            // Mặc định ép mọi viên trúng sọ (Bone: 8)
            payload.damage_report.hit_bone = 8;
            payload.damage_report.is_headshot = true;

            // Bỏ qua giáp/mũ: SMG thường bị cản bởi Giáp 3, ép xuyên giáp tuyệt đối
            if (payload.damage_report.armor_penetration !== undefined) {
                payload.damage_report.armor_penetration = 1.0; 
            }

            // Xóa bỏ khoảng cách giảm sát thương (AR/SMG bắn xa không bị yếu)
            if (payload.damage_report.distance_penalty !== undefined) {
                payload.damage_report.distance_penalty = 0.0;
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 6: ONE-TAP CORE (LÕI SÁT THƯƠNG ĐIỂM - V2.3)
// Nhiệm vụ: Triệt tiêu sai số đạn đơn, ép hồi tâm tức thì và tối ưu hóa
// phát bắn tử thần. (Nhiệm vụ tự bóp cò đã được giao cho TriggerCheck).
// ============================================================================
class OneTapCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;

        // --------------------------------------------------------------------
        // 1. TRIỆT TIÊU SAI SỐ VẬT LÝ SÚNG NGẮM/SÚNG LỤC
        // --------------------------------------------------------------------
        if (payload.weapon) {
            // Ép độ chính xác tuyệt đối cho viên đạn (Không nở tâm dù đang di chuyển)
            if (payload.weapon.base_spread !== undefined) payload.weapon.base_spread = 0.0;
            if (payload.weapon.dynamic_spread !== undefined) payload.weapon.dynamic_spread = 0.0;
            
            // Xóa nảy nòng (Recoil)
            if (payload.weapon.recoil_y !== undefined) payload.weapon.recoil_y = 0.0;
            if (payload.weapon.recoil_x !== undefined) payload.weapon.recoil_x = 0.0;
            
            // CHIẾN THUẬT SNIPER: Ép thời gian hồi tâm (Recoil Recovery) cực nhanh
            // Giúp màn hình không bị giật nảy lên sau khi bắn AWM/Woodpecker
            if (payload.weapon.recoil_recovery !== undefined) {
                payload.weapon.recoil_recovery = 9999.0; 
            }

            // Xóa mọi hình phạt di chuyển (Đã được M5 bảo chứng tĩnh lặng)
            if (payload.weapon.inaccuracy_move !== undefined) payload.weapon.inaccuracy_move = 0.0;
            if (payload.weapon.inaccuracy_jump !== undefined) payload.weapon.inaccuracy_jump = 0.0;
        }

        // --------------------------------------------------------------------
        // 2. KHÓA TIA ĐẠN (RAYCAST OVERRIDE FOR SNIPER)
        // --------------------------------------------------------------------
        // Ngay cả khi M7 (Camera) xoay chưa đến tâm hoàn hảo tuyệt đối, 
        // dòng code này sẽ bẻ cong vật lý của tia đạn để găm thẳng vào sọ.
        if (payload.bullet_events && Array.isArray(payload.bullet_events)) {
            
            if (targetState.id && targetState.predicted_pos && selfState.anchorPos) {
                const origin = selfState.anchorPos;
                const dest = targetState.predicted_pos;
                
                let dx = dest.x - origin.x;
                let dy = dest.y - origin.y;
                let dz = dest.z - origin.z;
                
                const mag = Math.sqrt(dx*dx + dy*dy + dz*dz);
                const perfectDir = { x: dx/mag, y: dy/mag, z: dz/mag };

                for (let i = 0; i < payload.bullet_events.length; i++) {
                    let bullet = payload.bullet_events[i];
                    if (bullet.ray_dir) {
                        bullet.ray_dir = { ...perfectDir };
                    }
                    // Gắn nhãn ID mục tiêu để Module 8 biến hóa sát thương
                    bullet.target_id = targetState.id;
                }
            }
        }

        // --------------------------------------------------------------------
        // 3. THIẾT LẬP SÁT THƯƠNG TỬ THẦN (ONE-SHOT KILL)
        // --------------------------------------------------------------------
        if (payload.damage_report) {
            // Ép Headshot tuyệt đối (Mã xương: 8)
            payload.damage_report.hit_bone = 8;
            payload.damage_report.is_headshot = true;
            
            // Xuyên giáp 100% - Biến mũ 3/4 của kẻ địch thành tờ giấy
            if (payload.damage_report.armor_penetration !== undefined) {
                payload.damage_report.armor_penetration = 1.0;
            }
            
            // Xóa bỏ khoảng cách giảm sát thương
            // Điều này cực kỳ kinh hoàng vì nó biến khẩu lục Desert Eagle 
            // có thể bắn xa ngang ngửa AWM mà không mất đi 1 giọt sát thương nào.
            if (payload.damage_report.distance_penalty !== undefined) {
                payload.damage_report.distance_penalty = 0.0;
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 8: MAGIC BULLET CORE (LÕI ĐẠN MA THUẬT - SNAP-AIM SYNC)
// Bản chất: Dỡ bỏ hoàn toàn giới hạn FOV (Góc nhìn an toàn). Hỗ trợ tối đa 
// cho những pha Snap-Aim giật màn hình 180 độ. Mắt nhìn đâu, đạn găm đó.
// ============================================================================
class MagicBulletCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;

        // Nếu M4 không khóa được mục tiêu, không can thiệp vào đạn
        if (!targetState || !targetState.id || !targetState.predicted_pos) return payload;

        // ====================================================================
        // 1. HITBOX ĐỘC QUYỀN (ANTI-OVERLAP CHO CHUỖI CHAIN-KILL 360)
        // ====================================================================
        if (payload.players && Array.isArray(payload.players)) {
            for (let i = 0; i < payload.players.length; i++) {
                let enemy = payload.players[i];
                
                if (enemy.hitboxes) {
                    const bodyParts = ['head', 'chest', 'pelvis', 'legs', 'arms'];
                    for (let p = 0; p < bodyParts.length; p++) {
                        let part = bodyParts[p];
                        if (enemy.hitboxes[part]) {
                            
                            // KHÔNG CẦN KIỂM TRA FOV NỮA! Cứ là mục tiêu bị khóa, tự động phình to 50 mét.
                            if (enemy.id === targetState.id) {
                                enemy.hitboxes[part].radius = 50.0;
                                if (enemy.collider_type !== undefined) enemy.collider_type = "INGAME_AIRDROP_LASER";
                            } 
                            // Thu nhỏ cực hạn toàn bộ kẻ địch xung quanh xuống 0.01 mét để 
                            // đạn Snap-Aim xuyên qua người chúng mà không bị kẹt va chạm nhầm.
                            else {
                                enemy.hitboxes[part].radius = 0.01; 
                            }
                        }
                    }
                }
            }
        }

        // ====================================================================
        // 2. MISS-TO-HIT CONVERTER (BẤT CHẤP MẠNG LAG)
        // ====================================================================
        // Snap-Aim đôi khi quay quá nhanh khiến Server bị giật nhịp (Desync) và báo đạn trượt.
        // Đoạn này xóa bỏ bằng chứng đạn trượt, ép nó thành gói tin trúng đích.
        if (payload.miss_event || (payload.bullet_event && payload.bullet_event.is_hit === false)) {
            if (payload.miss_event) {
                payload.hit_event = { ...payload.miss_event }; 
                delete payload.miss_event; 
            }
            if (payload.bullet_event) {
                payload.bullet_event.is_hit = true;
            }
            if (!payload.hit_event) payload.hit_event = {};
            payload.hit_event.target_id = targetState.id;
        }

        // ====================================================================
        // 3. TỐI ƯU HÓA TIA ĐẠN (CPU OPTIMIZED RAYCAST)
        // ====================================================================
        // Chỉ tính toán Vector 3D một lần duy nhất để tiết kiệm năng lượng CPU
        let perfectDir = null;
        if (selfState.anchorPos) {
            let dx = targetState.predicted_pos.x - selfState.anchorPos.x;
            let dy = targetState.predicted_pos.y - selfState.anchorPos.y;
            let dz = targetState.predicted_pos.z - selfState.anchorPos.z;
            const mag = Math.sqrt(dx*dx + dy*dy + dz*dz);
            perfectDir = { x: dx/mag, y: dy/mag, z: dz/mag };
        }

        // Ghi đè vào danh sách các viên đạn bắn ra
        if (perfectDir && payload.bullet_events && Array.isArray(payload.bullet_events)) {
            for (let i = 0; i < payload.bullet_events.length; i++) {
                payload.bullet_events[i].ray_dir = { ...perfectDir };
                payload.bullet_events[i].target_id = targetState.id;
            }
        }

        // ====================================================================
        // 4. CHỐT HẠ SÁT THƯƠNG VÀO LÕI SỌ
        // ====================================================================
        if (payload.damage_report || payload.hit_event) {
            let report = payload.damage_report || payload.hit_event;
            
            // Xóa bỏ sai số, ép trúng sọ (Bone 8)
            report.target_id = targetState.id;
            report.hit_bone = 8; 
            report.is_headshot = true;
            
            // Ép điểm chạm (hit_pos) trùng khớp tuyệt đối với Tọa độ Máy chủ (do M4 cung cấp)
            report.hit_pos = {
                x: targetState.predicted_pos.x,
                y: targetState.predicted_pos.y,
                z: targetState.predicted_pos.z
            };

            if (report.ray_dir && perfectDir) {
                report.ray_dir = { ...perfectDir };
            }
        }

        return payload;
    }
}

// ============================================================================
// BỘ ĐIỀU PHỐI TỔNG (MATRIX DISPATCHER V2.6 - FINAL)
// Bản vá: Trích xuất Ping động, Xóa Node an toàn (Chống Null Reference Crash)
// ============================================================================
class MatrixDispatcher {
    
    // [BẢN VÁ 4]: LỌC DỮ LIỆU AN TOÀN (ANTI-CRASH SANITIZER)
    sanitizeTelemetry(obj) {
        if (!obj || typeof obj !== 'object') return obj;

        const blacklistedKeywords = ['report', 'hackkill', 'cheat', 'telemetry', 'exception', 'T_31_', 'T_33_', 'T_34_'];
        const keys = Object.keys(obj);
        
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const lowerKey = key.toLowerCase();

            if (blacklistedKeywords.some(keyword => lowerKey.includes(keyword))) {
                // Dùng lệnh 'delete' để cắt đứt hoàn toàn Node khỏi bộ nhớ,
                // thay vì gán null gây lỗi Null Reference Exception cho C++ Engine.
                delete obj[key]; 
                continue;
            }

            if (obj[key] && typeof obj[key] === 'object') {
                obj[key] = this.sanitizeTelemetry(obj[key]);
            }
        }
        return obj;
    }

    processPayload(payload) {
        if (!payload) return payload;

        // [BẢN VÁ 3]: CẬP NHẬT PING ĐỘNG (DYNAMIC LATENCY TRACKER)
        // Lắng nghe và trích xuất độ trễ mạng thực tế để M4 tính toán điểm rơi chuẩn xác
        if (payload.ping !== undefined) {
            _global.__OmniState.currentPing = payload.ping;
        } else if (payload.network && payload.network.latency !== undefined) {
            _global.__OmniState.currentPing = payload.network.latency;
        }

        // BƯỚC 0: Tẩy rửa gói tin (Anti-Report)
        payload = this.sanitizeTelemetry(payload);

        // BƯỚC 1: Cập nhật Trạng thái vũ khí
        payload = WeaponClassifier.processWeaponState(payload);

        if (_global.__OmniState.weaponProfile && _global.__OmniState.weaponProfile.Core !== "IGNORE") {
            
            // BƯỚC 2: Mắt Thần (Cần Ping động để tính toán thời gian)
            payload = TargetKinematics.processTargetState(payload);

            // BƯỚC 3: Điều hướng Camera (Kèm Aim-Step và Y-Axis Breakaway)
            payload = CameraManipulator.execute(payload);

            // BƯỚC 4: Trigger Check (Bóp cò tự động nếu cần)
            payload = TriggerCheck.evaluate(payload);

            // BƯỚC 5: Đóng băng bệ phóng (ABS)
            payload = SelfKinematics.processSelfState(payload);

            // BƯỚC 6: Triệt tiêu Vật lý thô (Chỉ xóa Recoil/Spread, không tính toán Raycast nữa)
            const core = _global.__OmniState.weaponProfile.Core;
            if (core === "SHOTGUN") payload = ShotgunCore.execute(payload);
            else if (core === "AUTO") payload = AutoCore.execute(payload);
            else if (core === "ONETAP") payload = OneTapCore.execute(payload);

            // BƯỚC 7: Ma thuật Không gian (Gánh toàn bộ việc bẻ tia đạn và Hitbox)
            payload = MagicBulletCore.execute(payload);
        }

        // Định tuyến đệ quy
        const rootKeys = ['data', 'events', 'payload', 'messages', 'vessels'];
        for (let i = 0; i < rootKeys.length; i++) {
            const key = rootKeys[i];
            if (payload[key]) {
                if (Array.isArray(payload[key])) {
                    for (let j = 0; j < payload[key].length; j++) {
                        payload[key][j] = this.processPayload(payload[key][j]);
                    }
                } else if (typeof payload[key] === 'object') {
                    payload[key] = this.processPayload(payload[key]);
                }
            }
        }

        return payload;
    }
}

// ============================================================================
// KÍCH HOẠT SHADOWROCKET LAYER 7 INTERCEPTOR
// ============================================================================
if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"weapon"') !== -1 || $response.body.indexOf('"report"') !== -1 || $response.body.indexOf('T_33_') !== -1) {
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
