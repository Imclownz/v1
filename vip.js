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
// MODULE 4: TARGET KINEMATICS (LÕI ĐỘNG HỌC MỤC TIÊU - V2.4 APEX EYE)
// Tích hợp: Anti-Ziczac (Gia tốc), Parabolic Gravity (Chống Nhảy), 
// và Dynamic Bone Switcher (Thích ứng cận chiến sát sườn).
// ============================================================================
class TargetKinematics {
    static processTargetState(payload) {
        // 1. TỰ ĐỘNG LẤY MỐC TỌA ĐỘ BẢN THÂN
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
        const currentYaw = payload.aim_yaw !== undefined ? payload.aim_yaw : (_global.__OmniState.camera.prevYaw || 0.0);
        if (payload.aim_yaw !== undefined) _global.__OmniState.camera.prevYaw = payload.aim_yaw;

        // --------------------------------------------------------------------
        // 2. THREAT-MATRIX (Ma trận Sát thủ)
        // --------------------------------------------------------------------
        for (let i = 0; i < payload.players.length; i++) {
            const enemy = payload.players[i];
            
            if (enemy.is_dead || enemy.hp <= 0 || enemy.is_knocked) continue;
            if (enemy.team_id !== undefined && enemy.team_id === _global.__OmniState.team_id) continue;
            if (!enemy.pos) continue;

            const dx = enemy.pos.x - selfState.anchorPos.x;
            const dy = enemy.pos.y - selfState.anchorPos.y;
            const dz = enemy.pos.z - selfState.anchorPos.z;
            const distance3D = Math.sqrt(dx*dx + dy*dy + dz*dz);

            if (distance3D > 300.0) continue;

            let angleToEnemy = Math.atan2(dx, dz) * (180.0 / Math.PI);
            let fovDiff = Math.abs(angleToEnemy - currentYaw);
            if (fovDiff > 180) fovDiff = 360 - fovDiff;
            
            // Ở cự ly gần (<10m), góc FOV bị khuếch đại, giảm hình phạt FOV để dễ chuyển mục tiêu
            let fovWeight = distance3D < 10.0 ? 1.5 : 4.5;
            let fovPenalty = fovDiff * fovWeight;

            const hp = enemy.hp || 200.0;
            const hpMissingBonus = ((enemy.max_hp || 200.0) - hp) * 0.6; 
            
            let threatScore = distance3D + fovPenalty - hpMissingBonus;

            if (threatScore < lowestThreatScore) {
                lowestThreatScore = threatScore;
                bestTarget = enemy;
                bestTarget.distance = distance3D;
            }
        }

        // --------------------------------------------------------------------
        // 3. APEX EXTRAPOLATION (Toán học Không gian - Thời gian)
        // --------------------------------------------------------------------
        if (bestTarget) {
            const targetState = _global.__OmniState.target;
            const tracker = _global.__OmniState.tracker;
            const currentTime = Date.now();

            targetState.id = bestTarget.id;
            targetState.distance = bestTarget.distance;
            
            // [GIAO THỨC CẬN CHIẾN]: DYNAMIC BONE SWITCHER
            // Nếu địch ở quá gần (<= 5 mét), ngắm vào Ngực (Spine/Chest) thay vì Đầu.
            // Việc này chống M7 bị xoay lật góc ngửa mặt lên trời (Overshoot) khi địch lướt qua mặt.
            // Sát thương không bị ảnh hưởng vì M8 vẫn bẻ tia đạn vào xương 8 (Đầu).
            let targetAimPos = bestTarget.pos;
            if (bestTarget.distance <= 5.0 && bestTarget.hitboxes && bestTarget.hitboxes.chest) {
                targetAimPos = bestTarget.hitboxes.chest.pos; 
            } else if (bestTarget.hitboxes && bestTarget.hitboxes.head) {
                targetAimPos = bestTarget.hitboxes.head.pos;
            } else {
                targetAimPos = { x: bestTarget.pos.x, y: bestTarget.pos.y + 1.5, z: bestTarget.pos.z };
            }
            
            targetState.pos = { ...targetAimPos };

            if (!tracker[bestTarget.id]) {
                tracker[bestTarget.id] = { 
                    lastPos: { ...targetAimPos }, 
                    lastTime: currentTime, 
                    velocity: {x:0, y:0, z:0},
                    acceleration: 0.0 
                };
                targetState.predicted_pos = { ...targetAimPos }; 
            } 
            else {
                const history = tracker[bestTarget.id];
                let dt = (currentTime - history.lastTime) / 1000.0;
                
                if (dt > 0.0 && dt < 0.4) { 
                    // TÍNH VẬN TỐC (Velocity)
                    let vx = (targetAimPos.x - history.lastPos.x) / dt;
                    let vy = (targetAimPos.y - history.lastPos.y) / dt;
                    let vz = (targetAimPos.z - history.lastPos.z) / dt;

                    // [GIAO THỨC CHỐNG ZICZAC]: TÍNH GIA TỐC (Acceleration)
                    let ax = (vx - history.velocity.x) / dt;
                    let ay = (vy - history.velocity.y) / dt;
                    let az = (vz - history.velocity.z) / dt;
                    let accelMag = Math.sqrt(ax*ax + ay*ay + az*az);

                    // Hệ số suy giảm (Ziczac Dampener): Nếu gia tốc quá lớn (địch bẻ lái gấp), 
                    // tắt dự đoán tương lai, chuyển về Real-time Tracking để không bị văng lố.
                    let ziczacFactor = 1.0;
                    if (accelMag > 60.0) ziczacFactor = 0.15; // Giảm 85% tầm nhìn tương lai
                    else if (accelMag > 30.0) ziczacFactor = 0.5;

                    // [ANTI-DESYNC]: Phanh lướt Teleport
                    const speed = Math.sqrt(vx*vx + vy*vy + vz*vz);
                    if (speed > 15.0) {
                        vx = history.velocity.x * 0.3;
                        vy = 0.0;
                        vz = history.velocity.z * 0.3;
                        ziczacFactor = 0.0; // Khóa ngoại suy khi địch lướt
                    }

                    // Lưu lịch sử động lực học
                    history.velocity = { x: vx, y: vy, z: vz };
                    history.acceleration = accelMag;

                    // TÍNH THỜI GIAN ĐẠN BAY
                    const pingDelay = _global.__OmniState.currentPing / 1000.0;
                    let bulletSpeed = 600.0; 
                    if (_global.__OmniState.weaponProfile.Core === "SHOTGUN") bulletSpeed = 400.0;
                    if (_global.__OmniState.weaponProfile.Core === "ONETAP") bulletSpeed = 850.0;
                    
                    let extrapolationTime = (pingDelay + (bestTarget.distance / bulletSpeed)) * ziczacFactor;
                    if (extrapolationTime > 0.15) extrapolationTime = 0.15; 

                    // TÍNH ĐIỂM RƠI TƯƠNG LAI
                    let predX = targetAimPos.x + (vx * extrapolationTime);
                    let predZ = targetAimPos.z + (vz * extrapolationTime);
                    let predY = targetAimPos.y + (vy * extrapolationTime);

                    // [GIAO THỨC CHỐNG NHẢY]: PARABOLIC GRAVITY
                    // Nếu nhận thấy địch đang di chuyển mạnh trên trục Y (Nhảy lên hoặc Rơi xuống)
                    if (Math.abs(vy) > 1.5 && speed <= 15.0) {
                        // Áp dụng lực hấp dẫn (g = 9.8) cho thời gian tương lai: Y = V*t - 0.5*g*t^2
                        predY -= 0.5 * 9.8 * (extrapolationTime * extrapolationTime);
                    }

                    targetState.predicted_pos = { x: predX, y: predY, z: predZ };
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
// MODULE 7: CAMERA MANIPULATOR (LÕI ĐIỀU HƯỚNG THỊ GIÁC - V2.5 PREDATOR)
// Tích hợp: Aim-Step, Y-Axis Breakaway (Phá vỡ lực hút ngực), 
// Meter-by-Meter Lerping (Nội suy theo mét), và Ceiling Dampener (Trần bay).
// ============================================================================
class CameraManipulator {
    
    // Chuẩn hóa góc xoay (Giữ trong khoảng -180 đến 180 độ)
    static normalizeAngle(angle) {
        while (angle > 180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }

    // ------------------------------------------------------------------------
    // HÀM NỘI SUY TỪNG MÉT (METER-BY-METER LERPING) DÀNH RIÊNG CHO TRỤC Y
    // ------------------------------------------------------------------------
    static calculatePitchMultiplier(distance) {
        // Cự ly cực gần (< 2m): Lực kéo X2.5 lần để xé toạc lực hút vào Ngực của Game
        if (distance <= 2.0) return 2.5; 
        
        // Cự ly 2m - 10m: Giảm dần đều từ 2.5 xuống 1.0
        if (distance <= 10.0) {
            let t = (distance - 2.0) / 8.0; 
            return 2.5 - (1.5 * t); 
        }
        
        // Cự ly 10m - 50m: Giảm mượt mà từ 1.0 xuống 0.3 (Kéo lên đầu êm ái)
        if (distance <= 50.0) {
            let t = (distance - 10.0) / 40.0;
            return 1.0 - (0.7 * t);
        }
        
        // Cự ly rất xa (> 50m): Gần như không dùng lực kéo mạnh, chỉ mớm nhẹ (0.1)
        return 0.1;
    }

    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;
        const camState = _global.__OmniState.camera;
        const weaponState = _global.__OmniState.weapon;

        if (!targetState.id || !targetState.predicted_pos || payload.aim_yaw === undefined) return payload;

        // 1. TÍNH TOÁN DELTATIME (Ổn định khung hình)
        const currentTime = Date.now();
        let dt = (currentTime - camState.lastTime) / 1000.0;
        if (dt <= 0.0 || dt > 0.1) dt = 0.016; 
        camState.lastTime = currentTime;

        // 2. VECTOR TO EULER (Tọa độ 3D -> Góc nhìn)
        const origin = { x: selfState.anchorPos.x, y: selfState.anchorPos.y + 1.5, z: selfState.anchorPos.z };
        const dest = targetState.predicted_pos;

        const dx = dest.x - origin.x;
        const dy = dest.y - origin.y;
        const dz = dest.z - origin.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz);

        let targetYaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
        let targetPitch = Math.atan2(-dy, distXZ) * (180.0 / Math.PI);

        // 3. TIỀN TRẠM GHÌ TÂM (RCS - Recoil Control System)
        if (weaponState.isFiring && payload.weapon && payload.weapon.recoil_accumulation !== undefined) {
            const recoil = payload.weapon.recoil_accumulation;
            targetPitch -= (recoil * 1.35); 
        }

        const currentYaw = payload.aim_yaw;
        const currentPitch = payload.aim_pitch;

        let errorYaw = this.normalizeAngle(targetYaw - currentYaw);
        let errorPitch = this.normalizeAngle(targetPitch - currentPitch);

        // [GIAO THỨC 1]: AIM-STEP PROTOCOL (CHỐNG LẬT MÀN HÌNH)
        if (Math.abs(errorYaw) > 45.0) {
            camState.integralYaw = 0; camState.integralPitch = 0;
            return payload; // Buông tay nếu địch lướt ra sau lưng
        }

        // ====================================================================
        // [GIAO THỨC 2]: DYNAMIC PID VỚI TRỤC ĐỘC LẬP (INDEPENDENT AXIS PID)
        // ====================================================================
        // Tách riêng thông số Yaw (Ngang) và Pitch (Dọc)
        let Kp_yaw = 6.8, Kp_pitch = 6.8;
        let Ki = 0.015;
        let Kd_yaw = 0.35, Kd_pitch = 0.35;
        let maxSpeed = 55.0; 
        let deadzone = 0.4;  

        // ÁP DỤNG HỆ SỐ NỘI SUY Y-MULTIPLIER DỰA TRÊN KHOẢNG CÁCH
        let pitchMultiplier = this.calculatePitchMultiplier(targetState.distance);
        Kp_pitch *= pitchMultiplier; 

        // ĐIỀU CHỈNH THEO KỊCH BẢN CHIẾN ĐẤU
        if (targetState.distance <= 5.0) {
            // CẬN CHIẾN: Ngang phải xoay cực nhanh, Dọc được bơm Lực Bứt Phá (Breakaway Force)
            Kp_yaw = 14.0;       
            Kd_yaw = 0.95; Kd_pitch = 0.95; // Phanh cháy lốp cả 2 trục
            maxSpeed = 120.0;    
            deadzone = 1.2;      
        } 
        else if (targetState.distance > 50.0) {
            // BẮN TỈA: Giảm lực kéo ngang cho êm, trục Dọc đã bị hàm Lerp ép xuống 0.1
            Kp_yaw = 4.5;        
            Kd_yaw = 0.15; Kd_pitch = 0.15;
            maxSpeed = 35.0;     
            deadzone = 0.2;      
        }

        // [GIAO THỨC 3]: CẢM BIẾN TRẦN BAY (CEILING DAMPENER)
        // Xóa sổ lỗi "Vọt qua đầu" (Overshoot) ở cự ly > 10m
        if (targetState.distance > 10.0 && Math.abs(errorPitch) < 1.5) {
            // Khi hồng tâm đã vào sát sọ (sai số < 1.5 độ), bơm Lực Phanh (Kd) lên mức tàn bạo
            Kd_pitch = 2.0; // Phanh cứng như đập vào tường tàng hình
        }

        // VÙNG CHẾT (Deadzone): Tắt động cơ nếu tâm đã vào đúng điểm
        if (Math.abs(errorYaw) < deadzone && Math.abs(errorPitch) < deadzone) {
            camState.integralYaw = 0; camState.integralPitch = 0;
            return payload;
        }

        // 4. TÍNH TOÁN ĐỘNG CƠ PID CHO TỪNG TRỤC
        // Trục Ngang (Yaw)
        camState.integralYaw += errorYaw * dt;
        let derivYaw = (errorYaw - camState.prevErrorYaw) / dt;
        let outputYaw = (errorYaw * Kp_yaw) + (camState.integralYaw * Ki) + (derivYaw * Kd_yaw);

        // Trục Dọc (Pitch)
        camState.integralPitch += errorPitch * dt;
        let derivPitch = (errorPitch - camState.prevErrorPitch) / dt;
        let outputPitch = (errorPitch * Kp_pitch) + (camState.integralPitch * Ki) + (derivPitch * Kd_pitch);

        // GIỚI HẠN TUYỆT ĐỐI CHỐNG OVERSHOOT TRỤC Y
        // Không bao giờ cho phép lực kéo (outputPitch) lớn hơn chính khoảng cách cần kéo (errorPitch)
        if (targetState.distance > 10.0) {
            let maxPitchStep = errorPitch / dt;
            if (Math.abs(outputPitch) > Math.abs(maxPitchStep)) {
                outputPitch = maxPitchStep * 0.9; // Cắt giảm để vừa vặn chạm mép sọ
            }
        }

        camState.prevErrorYaw = errorYaw;
        camState.prevErrorPitch = errorPitch;

        // 5. HUMANIZER (Giới hạn tốc độ cơ học)
        const maxDegPerFrame = maxSpeed * dt; 
        outputYaw = Math.max(-maxDegPerFrame, Math.min(maxDegPerFrame, outputYaw * dt));
        outputPitch = Math.max(-maxDegPerFrame, Math.min(maxDegPerFrame, outputPitch * dt));

        // 6. GHI ĐÈ THỊ GIÁC VÀO GÓI TIN
        payload.aim_yaw = this.normalizeAngle(currentYaw + outputYaw);
        payload.aim_pitch = this.normalizeAngle(currentPitch + outputPitch);

        if (payload.camera_state) {
            payload.camera_state.yaw = payload.aim_yaw;
            payload.camera_state.pitch = payload.aim_pitch;
            delete payload.camera_state.target_x;
            delete payload.camera_state.target_y;
            delete payload.camera_state.target_z;
        }

        return payload;
    }
}

// ============================================================================
// MODULE PHỤ TRỢ: TRIGGER CHECK (LÕI KIỂM ĐỊNH KHAI HỎA)
// Nhiệm vụ: Đánh giá độ lệch hồng tâm so với mục tiêu. Nếu nằm trong ngưỡng
// sát thương (Headshot), tự động kích hoạt cờ Bóp cò (TriggerBot) để M5 đóng băng.
// ============================================================================
class TriggerCheck {
    static evaluate(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;
        const profile = _global.__OmniState.weaponProfile;
        const weaponState = _global.__OmniState.weapon;

        // Xóa cờ Trigger cũ của khung hình trước
        weaponState.triggerFired = false;

        // Điều kiện 1: Chỉ chạy TriggerBot nếu đang cầm súng Nhóm ONETAP (Sniper/Pistol)
        if (profile.Core !== "ONETAP") return payload;

        // Điều kiện 2: Phải có mục tiêu, có tọa độ điểm rơi và có góc nhìn Camera hiện tại
        if (!targetState.id || !targetState.predicted_pos || payload.aim_yaw === undefined) return payload;

        // --------------------------------------------------------------------
        // TOÁN HỌC KHÔNG GIAN: TÍNH GÓC LỆCH HỒNG TÂM
        // --------------------------------------------------------------------
        const origin = { x: selfState.anchorPos.x, y: selfState.anchorPos.y + 1.5, z: selfState.anchorPos.z };
        const dest = targetState.predicted_pos;

        const dx = dest.x - origin.x;
        const dy = dest.y - origin.y;
        const dz = dest.z - origin.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz);

        const requiredYaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
        const requiredPitch = Math.atan2(-dy, distXZ) * (180.0 / Math.PI);

        // Tính sai số giữa hướng Camera (sau khi M7 đã xoay) và Hướng lý tưởng
        let diffYaw = Math.abs(requiredYaw - payload.aim_yaw);
        if (diffYaw > 180) diffYaw = 360 - diffYaw;
        let diffPitch = Math.abs(requiredPitch - payload.aim_pitch);

        // --------------------------------------------------------------------
        // NGƯỠNG KÍCH HOẠT TỬ THẦN (Trigger Threshold)
        // --------------------------------------------------------------------
        // Ngưỡng 0.8 độ tương đương với việc hồng tâm vừa chạm vào viền Lõi Sọ.
        // Ở cự ly xa, 0.8 độ là một diện tích rất nhỏ, đảm bảo chỉ nổ súng khi chắc chắn Headshot.
        const triggerThreshold = 0.8;

        if (diffYaw <= triggerThreshold && diffPitch <= triggerThreshold) {
            
            // KÍCH HOẠT KHAI HỎA
            // Ghi đè vào gói tin để Server tin rằng bạn vừa chạm tay vào nút bắn
            payload.is_firing = true;
            if (payload.weapon) {
                payload.weapon.is_firing = true;
            }
            
            // Báo cáo cho Hệ thống (M5) biết rằng cò súng đã được kéo
            weaponState.isFiring = true;
            weaponState.triggerFired = true; 
        }

        return payload;
    }
}

// ============================================================================
// MODULE 5: SELF KINEMATICS (LÕI ĐỘNG HỌC BẢN THÂN - V2.3 ABS)
// Nhiệm vụ: Lắng nghe tín hiệu khai hỏa. Đóng băng động năng (Fake Lag) và 
// neo điểm sinh đạn (Fire-Origin Lock) để tạo bệ phóng tĩnh lặng 100%.
// ============================================================================
class SelfKinematics {
    static processSelfState(payload) {
        const state = _global.__OmniState.self;
        const weaponState = _global.__OmniState.weapon;
        
        // 1. GIAO THỨC ĐỒNG BỘ CÒ SÚNG (Trigger Synchronization)
        // Lắng nghe từ 3 nguồn: Trạng thái súng hiện tại, Tín hiệu từ M6_TriggerCheck, hoặc Gói tin gốc.
        const isFiring = weaponState.isFiring || weaponState.triggerFired || payload.is_firing;

        // Cập nhật tọa độ (Backup)
        if (payload.pos !== undefined) state.pos = { ...payload.pos };
        if (payload.anchorPos !== undefined) state.anchorPos = { ...payload.anchorPos };

        // Khởi tạo bộ nhớ neo đạn nếu chưa có
        if (state.anchoredFireOrigin === undefined) state.anchoredFireOrigin = null;

        // 2. KÍCH HOẠT HỆ THỐNG PHANH KHẨN CẤP (Chỉ khi nổ súng)
        if (isFiring) {
            
            // CHIẾN THUẬT A: ABSOLUTE ZERO DESYNC (Đóng băng vận tốc)
            // Lừa máy chủ rằng bạn đang đứng tĩnh trên mặt đất, xóa mọi hình phạt chạy nhảy
            if (payload.velocity !== undefined) {
                payload.velocity.x = 0.0;
                payload.velocity.y = 0.0;
                payload.velocity.z = 0.0;
            }
            if (payload.speed !== undefined) payload.speed = 0.0;
            if (payload.is_airborne !== undefined) payload.is_airborne = false;
            if (payload.is_moving !== undefined) payload.is_moving = false;

            // Bật cờ Tĩnh Lặng: Báo cho Lõi Vật Lý (M6) biết bệ phóng đã sẵn sàng
            state.isPerfectlyStill = true;

            // CHIẾN THUẬT B: FIRE-ORIGIN STABILIZATION (Neo điểm sinh đạn)
            if (payload.fire_origin !== undefined) {
                // Ghi nhớ điểm sinh ra viên đạn đầu tiên
                if (!state.anchoredFireOrigin) {
                    state.anchoredFireOrigin = { ...payload.fire_origin };
                } else {
                    // Cưỡng chế các viên đạn sau phát ra từ cùng 1 điểm
                    payload.fire_origin.x = state.anchoredFireOrigin.x;
                    payload.fire_origin.y = state.anchoredFireOrigin.y;
                    payload.fire_origin.z = state.anchoredFireOrigin.z;
                }
            }
            
            // Xóa bỏ biến rung lắc cơ thể khi xả súng
            if (payload.body_sway !== undefined) payload.body_sway = 0.0;

        } else {
            // 3. XẢ PHANH KHI NGỪNG BẮN (Anti-Rubberbanding)
            // Trả lại trạng thái động năng để nhân vật tiếp tục bay lượn trên màn hình
            state.isPerfectlyStill = false;
            state.anchoredFireOrigin = null; // Xóa điểm neo đạn
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
// MODULE 8: MAGIC BULLET CORE (LÕI ĐẠN MA THUẬT - BẢN VÁ V2.6 SAFEGUARD)
// Bản vá: Cảm biến FOV chống Silent Aim, Hitbox Độc quyền (Chống kẹt đạn), 
// và Tối ưu hóa CPU Raycast.
// ============================================================================
class MagicBulletCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;

        // Nếu không có mục tiêu, không làm gì cả
        if (!targetState || !targetState.id || !targetState.predicted_pos) return payload;

        // ====================================================================
        // BẢN VÁ 2: CẢM BIẾN FOV AN TOÀN (CHỐNG SILENT AIM & AIM-STEP BUG)
        // ====================================================================
        let isSafeToMagic = true;
        // Lấy góc nhìn hiện tại (Ưu tiên từ payload, nếu không có thì lấy từ bộ nhớ đệm M7)
        let currentYaw = payload.aim_yaw !== undefined ? payload.aim_yaw : (_global.__OmniState.camera.prevYaw || 0.0);
        
        if (selfState.anchorPos) {
            const dx = targetState.predicted_pos.x - selfState.anchorPos.x;
            const dz = targetState.predicted_pos.z - selfState.anchorPos.z;
            let angleToTarget = Math.atan2(dx, dz) * (180.0 / Math.PI);
            
            let fovDiff = Math.abs(angleToTarget - currentYaw);
            if (fovDiff > 180) fovDiff = 360 - fovDiff;
            
            // NGƯỠNG AN TOÀN: 60 Độ. 
            // Nếu M7 nhả tâm (Aim-step) mà người chơi lỡ tay bóp cò khi địch đang ở 
            // ngoài tầm nhìn (> 60 độ), CẤM BẬT MAGIC BULLET để tránh đạn bay ngược 180 độ.
            if (fovDiff > 60.0) {
                isSafeToMagic = false;
            }
        }

        // ====================================================================
        // BẢN VÁ 1: HITBOX ĐỘC QUYỀN (ANTI-OVERLAP) & XUYÊN THẤU
        // ====================================================================
        if (payload.players && Array.isArray(payload.players)) {
            for (let i = 0; i < payload.players.length; i++) {
                let enemy = payload.players[i];
                
                if (enemy.hitboxes) {
                    const bodyParts = ['head', 'chest', 'pelvis', 'legs', 'arms'];
                    for (let p = 0; p < bodyParts.length; p++) {
                        let part = bodyParts[p];
                        if (enemy.hitboxes[part]) {
                            
                            // CHỈ thổi phồng Hitbox của mục tiêu đang bị ngắm VÀ phải nằm trong FOV an toàn
                            if (enemy.id === targetState.id && isSafeToMagic) {
                                enemy.hitboxes[part].radius = 50.0;
                                if (enemy.collider_type !== undefined) enemy.collider_type = "INGAME_AIRDROP_LASER";
                            } 
                            // Bóp nhỏ Hitbox của TẤT CẢ các kẻ địch khác xuống 0.1 mét
                            // Điều này biến bọn chúng thành "Bóng ma", đạn sẽ xuyên qua người chúng 
                            // để găm vào đúng mục tiêu chính ở phía sau mà không bị kẹt.
                            else {
                                enemy.hitboxes[part].radius = 0.1; 
                            }
                        }
                    }
                }
            }
        }

        // NẾU KHÔNG AN TOÀN (ĐỊCH SAU LƯNG), NGỪNG XỬ LÝ SÁT THƯƠNG
        if (!isSafeToMagic) return payload;

        // ====================================================================
        // CHIẾN THUẬT 2: MISS-TO-HIT CONVERTER
        // ====================================================================
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
        // BẢN VÁ 5: QUẢN LÝ RAYCAST ĐỘC QUYỀN VÀ SÁT THƯƠNG TRUNG TÂM (CPU OPTIMIZATION)
        // ====================================================================
        // Bẻ tia đạn trực tiếp cho các sự kiện đạn lẻ (Bullet Events)
        let perfectDir = null;
        if (selfState.anchorPos) {
            let dx = targetState.predicted_pos.x - selfState.anchorPos.x;
            let dy = targetState.predicted_pos.y - selfState.anchorPos.y;
            let dz = targetState.predicted_pos.z - selfState.anchorPos.z;
            const mag = Math.sqrt(dx*dx + dy*dy + dz*dz);
            perfectDir = { x: dx/mag, y: dy/mag, z: dz/mag };
        }

        if (perfectDir && payload.bullet_events && Array.isArray(payload.bullet_events)) {
            for (let i = 0; i < payload.bullet_events.length; i++) {
                payload.bullet_events[i].ray_dir = { ...perfectDir };
                payload.bullet_events[i].target_id = targetState.id;
            }
        }

        // Cập nhật Gói tin Báo cáo Sát thương (Damage Report)
        if (payload.damage_report || payload.hit_event) {
            let report = payload.damage_report || payload.hit_event;
            
            report.target_id = targetState.id;
            report.hit_bone = 8; // Ép Headshot
            report.is_headshot = true;
            
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
