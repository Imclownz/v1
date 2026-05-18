/**
 * ==============================================================================
 * PROJECT: OMNI-MATRIX V2.3 (PERFECT PIPELINE ARCHITECTURE)
 * Pipeline: Sanitizer -> M1(Gun) -> M4(Eyes) -> M7(Camera) -> TriggerCheck -> M5(Stance) -> M2/3/6(Physics) -> M8(Magic)
 * Status: Framework initialized. Modules pending deployment.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);

// ============================================================================
// 0. GLOBAL STATE (BỘ NHỚ DÙNG CHUNG ĐỒNG BỘ TỔNG V2.3 - ZERO PING)
// ============================================================================
if (!_global.__OmniState || _global.__OmniState.version !== "MATRIX_V2.3") {
    _global.__OmniState = {
        version: "MATRIX_V2.3",
        // Đã xóa bỏ currentPing
        weaponProfile: { Core: "IGNORE", RequireZeroVelocity: false },
        
        target: { id: null, pos: null, predicted_pos: null, distance: 999.0 },
        self: { pos: {x:0, y:0, z:0}, anchorPos: {x:0, y:0, z:0}, vel: {x:0, y:0, z:0}, isPerfectlyStill: false, anchoredFireOrigin: null },
        
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
// MODULE 1: WEAPON CLASSIFIER (LÕI NHẬN DIỆN VŨ KHÍ - V8.0 MARKSMAN EXCLUSIVE)
// Nhiệm vụ: Phân tích siêu dữ liệu súng. ĐÃ LOẠI BỎ SNIPER (AWM, M82B, KAR98).
// Nhóm ONETAP giờ đây chỉ phục vụ súng lục nặng (DE, M500) và súng trường 
// thiện xạ (Woodpecker, SVD, AC80, SKS).
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
        
        // 2. NHÓM THIỆN XẠ / ONE-TAP (CHỈ SÚNG LỤC NẶNG & SÚNG TRƯỜNG BÁN TỰ ĐỘNG)
        // [BẢN VÁ]: Đã xóa bỏ các từ khóa SNIPER, AWM, M82B, KAR98.
        else if (identifier.includes("DESERT_EAGLE") || identifier.includes("M500") || 
                 identifier.includes("WOODPECKER") || identifier.includes("SVD") || 
                 identifier.includes("AC80") || identifier.includes("SKS")) {
            profile.Core = "ONETAP";
            // Vẫn giữ cờ yêu cầu đóng băng vận tốc (Neo thời không 1-Tick ở M5) 
            // để đảm bảo phát đạn DE/Woodpecker bay chuẩn 100%.
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

        // LƯU Ý MỚI: 
        // Bất kỳ vũ khí nào mang mã AWM, KAR98, M82B, v.v. giờ đây sẽ không khớp 
        // với bất kỳ điều kiện nào ở trên. Nó sẽ tự động trả về "IGNORE".
        // Game Engine sẽ tự xử lý hoàn toàn cơ chế bắn tỉa, không còn xung đột!
        return profile;
    }

    static processWeaponState(payload) {
        const weaponState = _global.__OmniState.weapon;

        // Trích xuất và đồng bộ trạng thái bóp cò
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
// MODULE 4: TARGET KINEMATICS (LÕI ĐỘNG HỌC MỤC TIÊU - V10.0 ABSOLUTE PRESENT)
// Tích hợp: Magnetic Inversion, Pure Proximity (Tối giản Pha 2).
// ĐÃ XÓA BỎ HOÀN TOÀN: Lịch sử tọa độ, Backtracking, Dự đoán Tương lai và Vận tốc.
// Chân lý duy nhất: Tọa độ Hiện Tại Tuyệt Đối.
// ============================================================================
class TargetKinematics {
    
    static normalizeAngle(angle) {
        while (angle > 180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }

    static processTargetState(payload) {
        // 1. TỰ ĐỘNG LẤY MỐC TỌA ĐỘ BẢN THÂN
        if (payload.anchorPos !== undefined) {
            _global.__OmniState.self.anchorPos = { ...payload.anchorPos };
        } else if (payload.pos !== undefined && _global.__OmniState.self.anchorPos.x === 0) {
            _global.__OmniState.self.anchorPos = { ...payload.pos };
        }

        // Tắt Aim-Assist rác của môi trường
        if (payload.aim_assist !== undefined) {
            payload.aim_assist.friction = 0.0;
            payload.aim_assist.adhesion = 0.0;
            payload.aim_assist.snap_weight = -999999.0;
        }

        if (!payload || !payload.players || !Array.isArray(payload.players)) return payload;

        const selfState = _global.__OmniState.self;
        if (!selfState.anchorPos || selfState.anchorPos.x === 0) return payload; 

        let bestTarget = null;
        let lowestThreatScore = 99999999.0;
        const currentYaw = payload.aim_yaw !== undefined ? payload.aim_yaw : (_global.__OmniState.camera.prevYaw || 0.0);
        if (payload.aim_yaw !== undefined) _global.__OmniState.camera.prevYaw = payload.aim_yaw;

        // ====================================================================
        // 2. GIAO THỨC ĐẢO NGƯỢC TỪ TÍNH (MAGNETIC INVERSION)
        // ====================================================================
        for (let i = 0; i < payload.players.length; i++) {
            const enemy = payload.players[i];
            
            if (enemy.hitboxes) {
                // KHUẾCH ĐẠI TỪ TÍNH LÕI SỌ
                if (enemy.hitboxes.head) {
                    if (enemy.hitboxes.head.snap_weight !== undefined) enemy.hitboxes.head.snap_weight = 999999.0;
                    if (enemy.hitboxes.head.friction !== undefined) enemy.hitboxes.head.friction = 1.0;
                    enemy.hitboxes.head.priority = "HIGHEST"; 
                }

                // BÓP NÁT TỪ TÍNH THÂN DƯỚI
                const junkParts = ['chest', 'spine', 'pelvis', 'legs', 'arms', 'left_arm', 'right_arm', 'left_leg', 'right_leg'];
                for (let p = 0; p < junkParts.length; p++) {
                    let part = junkParts[p];
                    if (enemy.hitboxes[part]) {
                        if (enemy.hitboxes[part].snap_weight !== undefined) enemy.hitboxes[part].snap_weight = -999999.0;
                        if (enemy.hitboxes[part].friction !== undefined) enemy.hitboxes[part].friction = 0.0;
                        enemy.hitboxes[part].priority = "IGNORE";
                    }
                }
            }

            // --- MA TRẬN ĐÁNH GIÁ MỤC TIÊU (PURE PROXIMITY & FOV) ---
            if (enemy.is_dead || enemy.hp <= 0 || enemy.is_knocked) continue;
            if (enemy.team_id !== undefined && enemy.team_id === _global.__OmniState.team_id) continue;
            if (!enemy.pos) continue;

            const dx = enemy.pos.x - selfState.anchorPos.x;
            const dy = enemy.pos.y - selfState.anchorPos.y;
            const dz = enemy.pos.z - selfState.anchorPos.z;
            const distance3D = Math.sqrt(dx*dx + dy*dy + dz*dz);

            if (distance3D > 300.0) continue;

            let threatScore = distance3D; 

            let angleToEnemy = Math.atan2(dx, dz) * (180.0 / Math.PI);
            let fovDiff = Math.abs(this.normalizeAngle(angleToEnemy - currentYaw));
            let fovPenalty = fovDiff * (distance3D < 10.0 ? 1.0 : 3.5);
            
            threatScore = threatScore + fovPenalty;

            if (threatScore < lowestThreatScore) {
                lowestThreatScore = threatScore;
                bestTarget = enemy;
                bestTarget.distance = distance3D;
            }
        }

        // ====================================================================
        // 3. ABSOLUTE PRESENT EXTRACTION (TRÍCH XUẤT HIỆN TẠI TUYỆT ĐỐI)
        // ====================================================================
        if (bestTarget) {
            const targetState = _global.__OmniState.target;

            targetState.id = bestTarget.id;
            targetState.distance = bestTarget.distance;
            
            // Bắt lấy tọa độ duy nhất của Lõi Sọ tại mili-giây này
            let headCenter = bestTarget.hitboxes?.head?.pos || { x: bestTarget.pos.x, y: bestTarget.pos.y + 1.5, z: bestTarget.pos.z };

            // ĐỒNG NHẤT KHÔNG - THỜI GIAN
            // Ép cả Đồ họa (pos) và Vật lý Đạn đạo (predicted_pos) chĩa chung vào 1 điểm.
            // Bất kể là Camera M7 hay Tia đạn M8, mục tiêu chỉ có một!
            targetState.pos = { ...headCenter };
            targetState.predicted_pos = { ...headCenter };
            
            // Xóa sổ động năng (Không cần tính toán vận tốc nữa)
            targetState.velocity = { x: 0, y: 0, z: 0 };
            
        } else {
            // Reset khi mất mục tiêu
            _global.__OmniState.target = { 
                id: null, pos: null, predicted_pos: null, distance: 999999.0, velocity: {x:0, y:0, z:0} 
            };
        }

        return payload;
    }
}

// ============================================================================
// MODULE 7: CAMERA MANIPULATOR (LÕI ĐIỀU HƯỚNG - V10.0 ABSOLUTE MAGNET)
// Tích hợp: Nam Châm Vĩnh Cửu (100% Teleport every frame), Zero Friction.
// ĐÃ XÓA BỎ: Feedforward, Đảo mạch Không-Thời gian, và Phân chia 4 Pha.
// Hoạt động thuần túy dựa trên Hiện Tại Tuyệt Đối.
// ============================================================================
class CameraManipulator {
    
    static normalizeAngle(angle) {
        while (angle > 180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }

    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;
        const camState = _global.__OmniState.camera;
        const weaponState = _global.__OmniState.weapon;

        // [ZERO FRICTION]: Triệt tiêu Ma sát "đầm lầy" tại Camera
        if (payload.aim_assist !== undefined) {
            payload.aim_assist.adhesion = 0.0;
            payload.aim_assist.friction = 0.0;
        }

        // Bỏ qua nếu mất mục tiêu (Dữ liệu Hiện tại từ M4 là bắt buộc)
        if (!targetState.id || !targetState.pos || payload.aim_yaw === undefined) {
            camState.wasFiring = false;
            return payload;
        }

        const isFiring = weaponState.isFiring || weaponState.triggerFired || payload.is_firing;
        const isScoping = payload.is_scoping || (payload.weapon && payload.weapon.is_scoping);
        const currentTime = Date.now();
        
        camState.wasFiring = isFiring;

        if (!isFiring && !isScoping) {
            camState.integralYaw = 0;
            camState.integralPitch = 0;
            return payload;
        }

        const origin = selfState.lastAnchor ? 
            { x: selfState.lastAnchor.x, y: selfState.lastAnchor.y + 1.5, z: selfState.lastAnchor.z } : 
            { x: selfState.anchorPos.x, y: selfState.anchorPos.y + 1.5, z: selfState.anchorPos.z };
            
        // ====================================================================
        // CHÂN LÝ HIỆN TẠI (ABSOLUTE PRESENT DESTINATION)
        // ====================================================================
        // Không còn quá khứ hay tương lai. Mọi ánh nhìn đều chĩa thẳng vào Lõi Sọ hiện tại.
        const dest = targetState.pos;

        const dx = dest.x - origin.x;
        const dy = dest.y - origin.y;
        const dz = dest.z - origin.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz);

        let trueYaw = this.normalizeAngle(Math.atan2(dx, dz) * (180.0 / Math.PI));
        let truePitch = this.normalizeAngle(Math.atan2(-dy, distXZ) * (180.0 / Math.PI));

        const currentYaw = payload.aim_yaw;
        const currentPitch = payload.aim_pitch;

        let errorYaw = this.normalizeAngle(trueYaw - currentYaw);
        let errorPitch = this.normalizeAngle(truePitch - currentPitch);

        let dt = (currentTime - (camState.lastTime || currentTime)) / 1000.0;
        if (dt <= 0.0 || dt > 0.1) dt = 0.016; 
        camState.lastTime = currentTime;

        let outputYawStep = 0;
        let outputPitchStep = 0;
        let disableEMA = false;

        // ====================================================================
        // GIAO THỨC NAM CHÂM VĨNH CỬU (PERMANENT MAGNET LOCK-ON)
        // ====================================================================
        if (isFiring) {
            // [BÓP CÒ LÀ DÍNH]: Không có giới hạn thời gian (80ms), không có Vùng chết.
            // Bơm 100% lực đẩy vào cả 2 trục Không gian bất chấp kẻ địch di chuyển thế nào.
            outputYawStep = errorYaw;
            outputPitchStep = errorPitch;
            
            // Xả sạch động năng tồn dư
            camState.integralYaw = 0;
            camState.integralPitch = 0;
            disableEMA = true; // Tắt hoàn toàn độ trễ mượt để Snapaim đạt tốc độ ánh sáng
        } 
        else {
            // [RÀ TÂM MƯỢT MÀ]: Khi chỉ bật ống ngắm (Scope) nhưng chưa bắn.
            // Giữ lại thuật toán PID cơ bản để rà tâm nhìn giống người thật đang vuốt màn hình.
            let Kp_yaw = 25.0; 
            let Kp_pitch = 25.0;
            let dynamicKd_yaw = 0.2 + (8.0 / (Math.abs(errorYaw) + 0.5));
            let dynamicKd_pitch = 0.2 + (8.0 / (Math.abs(errorPitch) + 0.5));

            camState.integralYaw = (camState.integralYaw || 0) + (errorYaw * dt);
            camState.integralPitch = (camState.integralPitch || 0) + (errorPitch * dt);

            let derivYaw = (errorYaw - (camState.prevErrorYaw || errorYaw)) / dt;
            let derivPitch = (errorPitch - (camState.prevErrorPitch || errorPitch)) / dt;

            let pidYaw = (errorYaw * Kp_yaw) + (camState.integralYaw * 0.01) + (derivYaw * dynamicKd_yaw);
            let pidPitch = (errorPitch * Kp_pitch) + (camState.integralPitch * 0.01) + (derivPitch * dynamicKd_pitch);

            outputYawStep = pidYaw * dt;
            outputPitchStep = pidPitch * dt;
            
            // Chống văng tâm dọc quá đà
            if (Math.abs(outputPitchStep) > Math.abs(errorPitch)) outputPitchStep = errorPitch;
        }

        camState.prevErrorYaw = errorYaw;
        camState.prevErrorPitch = errorPitch;

        // ====================================================================
        // KÍNH LỌC EMA TẦN SỐ CAO 
        // ====================================================================
        if (camState.emaYaw === undefined) camState.emaYaw = currentYaw;
        if (camState.emaPitch === undefined) camState.emaPitch = currentPitch;

        let rawNewYaw = currentYaw + outputYawStep;
        let rawNewPitch = currentPitch + outputPitchStep;

        // Nếu đang bắn (disableEMA = true), hệ số alpha = 1.0 (Không lọc, chốt tọa độ thô).
        // Nếu không bắn, alpha = 0.85 (Lọc mượt đồ họa).
        let alpha = disableEMA ? 1.0 : 0.85;

        camState.emaYaw = this.normalizeAngle((rawNewYaw * alpha) + (camState.emaYaw * (1.0 - alpha)));
        camState.emaPitch = this.normalizeAngle((rawNewPitch * alpha) + (camState.emaPitch * (1.0 - alpha)));

        payload.aim_yaw = camState.emaYaw;
        payload.aim_pitch = camState.emaPitch;

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
// MODULE 6.5: TRIGGER CHECK (BỘ LỌC ĐỒNG BỘ - NATIVE SYNC ENGINE)
// Tích hợp: Native 0.2s Wind-up Sync (Thả rông cò súng), Hitchance Evaluator 
// (Chống lãng phí đạn), và Predictive Pre-Fire (Tự động cướp cò đón lõng).
// XÓA BỎ: Artificial 200ms Delay (Giam lỏng cò súng).
// ============================================================================
class TriggerCheck {
    static evaluate(payload) {
        const targetState = _global.__OmniState.target;
        const weaponState = _global.__OmniState.weapon;
        const profile = _global.__OmniState.weaponProfile;

        // 1. KHỞI TẠO CHU KỲ (Reset trạng thái của Tick trước)
        weaponState.triggerFired = false;
        
        // Xóa bỏ báo động vẩy tâm thủ công của bản cũ, 
        // vì Native Aim-Assist của Game sẽ tự động kéo tâm vào "Ngực giả" của M4.
        weaponState.forceAbsoluteSnap = false; 
        weaponState.isPendingFire = false;
        if (weaponState.aimSnapStartTime) weaponState.aimSnapStartTime = null;

        // Bỏ qua nếu vũ khí không hỗ trợ (Lựu đạn/Cận chiến/Tay không)
        if (profile.Core === "IGNORE") return payload;

        // Trạng thái gốc: Người chơi có đang CỐ TÌNH bấm nút bắn trên màn hình không?
        let isManualFiring = payload.is_firing || (payload.weapon && payload.weapon.is_firing);

        // ====================================================================
        // 2. PERFECT SYNC INTERCEPTOR (Khóa Cò An Toàn)
        // ====================================================================
        // Nếu M4 chưa tìm thấy cái bóng nào hợp lệ, hoặc địch đã hoàn toàn out-range.
        if (!targetState.id || !targetState.predicted_pos) {
            
            // ĐÁNH CHẶN GÓI TIN: Tước quyền nổ súng để không phí đạn vào không khí.
            if (isManualFiring) {
                payload.is_firing = false;
                if (payload.weapon) payload.weapon.is_firing = false;
                weaponState.isFiring = false;
            }
            return payload;
        }

        // Truy xuất dữ liệu động học từ M4
        const tracker = _global.__OmniState.tracker[targetState.id];
        if (!tracker) return payload;

        // ====================================================================
        // 3. HITCHANCE & PENETRATION ENGINE (Toán Tử Xác Suất Đục Tường)
        // ====================================================================
        let hitchance = 100.0;
        
        // Phân tích trạng thái vật cản của mục tiêu từ các cờ ẩn trong gói tin
        let isTargetBehindCover = tracker.is_behind_cover || false; 

        if (isTargetBehindCover) {
            // Nếu địch nấp kín và bạn cầm súng sấy (AR/SMG) -> Tỷ lệ trúng = 0%
            // Cấm xả đạn bừa bãi vào tường làm lộ vị trí.
            if (profile.Core !== "AUTO") {
                hitchance = 0.0; 
            } 
            // Nếu bạn cầm súng bắn tỉa xuyên tường (M82B/ONETAP) -> Giữ nguyên 100% để đục.
        }

        // TƯỚC QUYỀN NỔ SÚNG NẾU TỶ LỆ TRÚNG BẰNG 0
        if (hitchance === 0.0) {
            payload.is_firing = false;
            if (payload.weapon) payload.weapon.is_firing = false;
            weaponState.isFiring = false;
            return payload; 
        }

        // ====================================================================
        // 4. PREDICTIVE PRE-FIRE (Đón Lõng Tiên Đoán)
        // ====================================================================
        let shouldAutoFire = false;
        
        if (tracker.velocity) {
            // Đo đạc tốc độ di chuyển ngang của kẻ địch
            const speed = Math.sqrt(tracker.velocity.x**2 + tracker.velocity.z**2);
            
            // TRƯỜNG HỢP A: Kẻ địch đang lướt Tatsuya ra khỏi vật cản (Vận tốc > 4.0 m/s)
            // Tự động cướp cò đón lõng ngay lập tức trước khi tay người kịp phản xạ!
            if (speed > 4.0 && tracker.is_partially_hidden) {
                shouldAutoFire = true;
            }
            
            // TRƯỜNG HỢP B: Kẻ địch đang đứng im loot đồ hoặc ngắm bắn lén (Vận tốc < 1.0 m/s)
            // Và không có vật cản cứng. Bạn cầm súng Sniper. Tử hình lập tức!
            if (profile.Core === "ONETAP" && speed < 1.0 && !isTargetBehindCover) {
                shouldAutoFire = true;
            }
        }

        // ====================================================================
        // 5. THỰC THI ÁN TỬ (NATIVE EXECUTION COMMAND)
        // ====================================================================
        // Chốt hạ: Không giam cò nữa. Thả lệnh Khai hỏa đi ngay lập tức để 
        // Engine C++ của Game bắt đầu đếm ngược 0.2s và kích hoạt lực hút Aim-Assist.
        if (isManualFiring || shouldAutoFire) {
            
            // Tiêm cờ khai hỏa vào gói tin bay lên Server
            payload.is_firing = true;
            if (payload.weapon) {
                payload.weapon.is_firing = true;
                
                // Loại bỏ delay tích tụ của súng (Ví dụ: Charge Buster, súng sạc năng lượng)
                if (payload.weapon.charge_time !== undefined) payload.weapon.charge_time = 999999.0;
            }
            
            // Phát sóng tín hiệu (Broadcast Signal) cho các Lõi bên dưới
            weaponState.isFiring = true;
            
            // Đánh thức M5: "Này Lõi Động Học, tôi bóp cò rồi, bật Fake Lag và Tàng Hình ngay!"
            weaponState.triggerFired = true; 
        }

        return payload;
    }
}

// ============================================================================
// MODULE 5: SELF KINEMATICS (LÕI ĐỘNG HỌC BẢN THÂN - V10.0 ABSOLUTE BONE SYNC)
// Tích hợp: Spine Forcing (Cưỡng chế Xương sống Hiện tại), Lerp Nullification 
// (Triệt tiêu độ trễ Hoạt ảnh 100%), Dynamic Barrel Offset, và Phanh Lượng Tử.
// ĐỒNG BỘ: Hoàn toàn hướng về tọa độ Hiện Tại Tuyệt Đối của Lõi Sọ.
// ============================================================================
class SelfKinematics {
    static processSelfState(payload) {
        const state = _global.__OmniState.self;
        const targetState = _global.__OmniState.target;
        const weaponState = _global.__OmniState.weapon;
        const camState = _global.__OmniState.camera;

        const isFiring = weaponState.isFiring || weaponState.triggerFired || payload.is_firing;

        if (!state.history) state.history = [];
        if (!state.lastAnchor) state.lastAnchor = null;

        // ====================================================================
        // TRẠNG THÁI NGHỈ: LIÊN TỤC CẬP NHẬT TỌA ĐỘ (CHỐNG GIẬT LAG)
        // ====================================================================
        if (payload.pos !== undefined) {
            state.history.unshift({ ...payload.pos });
            if (state.history.length > 5) state.history.pop(); 
        }

        if (!isFiring) {
            if (payload.anchorPos !== undefined) {
                state.lastAnchor = { ...payload.anchorPos };
            }
            return payload; 
        }

        // ====================================================================
        // 1. ABSOLUTE BONE SYNC & LERP NULLIFICATION (ĐỒNG BỘ XƯƠNG TỨC THỜI)
        // ====================================================================
        // Bắt cóc mô hình 3D: Ép toàn bộ khung xương quay theo Camera (M7)
        let avatar = payload.avatar_state || payload.character || payload;

        if (avatar) {
            // A. Spine Forcing: Chèn thẳng góc quay của M7 vào cơ thể
            if (camState.emaYaw !== undefined) {
                if (avatar.body_yaw !== undefined) avatar.body_yaw = camState.emaYaw;
                if (avatar.torso_yaw !== undefined) avatar.torso_yaw = camState.emaYaw;
                if (avatar.weapon_yaw !== undefined) avatar.weapon_yaw = camState.emaYaw;
            }
            
            if (camState.emaPitch !== undefined) {
                if (avatar.body_pitch !== undefined) avatar.body_pitch = camState.emaPitch;
                if (avatar.torso_pitch !== undefined) avatar.torso_pitch = camState.emaPitch;
                if (avatar.weapon_pitch !== undefined) avatar.weapon_pitch = camState.emaPitch;
            }

            // B. Lerp Nullification: Xóa sạch hiệu ứng chuyển cảnh mềm (Blending)
            // Teleport tư thế ngay lập tức trong 0 mili-giây
            if (avatar.turn_speed !== undefined) avatar.turn_speed = 99999.0; 
            if (avatar.turn_animation_time !== undefined) avatar.turn_animation_time = 0.0;
            if (avatar.blend_weight !== undefined) avatar.blend_weight = 0.0;
            if (avatar.ik_blend !== undefined) avatar.ik_blend = 1.0; 
        }

        // C. Cưỡng chế Vector Súng đâm thẳng vào Hiện Tại
        if (payload.weapon_forward_vector !== undefined && targetState.pos && state.lastAnchor) {
            let dx = targetState.pos.x - state.lastAnchor.x;
            let dy = targetState.pos.y - (state.lastAnchor.y + 1.5);
            let dz = targetState.pos.z - state.lastAnchor.z;
            let mag = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (mag > 0) {
                payload.weapon_forward_vector = { x: dx/mag, y: dy/mag, z: dz/mag };
            }
        }

        // ====================================================================
        // 2. CHRONOS ANCHOR (NEO VỊ TRÍ)
        // ====================================================================
        if (payload.anchorPos !== undefined && state.lastAnchor) {
            payload.anchorPos.x = state.lastAnchor.x;
            payload.anchorPos.y = state.lastAnchor.y;
            payload.anchorPos.z = state.lastAnchor.z;
        }

        // ====================================================================
        // 3. DYNAMIC BARREL OFFSET (CĂN CHỈNH ĐIỂM SINH ĐẠN THEO HIỆN TẠI)
        // ====================================================================
        if (payload.fire_origin !== undefined) {
            if (targetState.id && targetState.distance < 3.0 && targetState.pos) {
                // Cận chiến: Nhét nòng súng vào thẳng Sọ não hiện tại của địch
                payload.fire_origin = {
                    x: targetState.pos.x,
                    y: targetState.pos.y,
                    z: targetState.pos.z - 0.1 
                };
            } 
            else if (state.lastAnchor && camState.emaYaw !== undefined && camState.emaPitch !== undefined) {
                // Tầm xa: Tịnh tiến điểm sinh đạn ra khỏi cơ thể 0.8 mét theo trục Camera
                let yawRad = camState.emaYaw * (Math.PI / 180.0);
                let pitchRad = camState.emaPitch * (Math.PI / 180.0);
                
                let forwardX = Math.sin(yawRad) * Math.cos(pitchRad);
                let forwardY = -Math.sin(pitchRad);
                let forwardZ = Math.cos(yawRad) * Math.cos(pitchRad);

                payload.fire_origin = {
                    x: state.lastAnchor.x + (forwardX * 0.8),
                    y: state.lastAnchor.y + 1.5 + (forwardY * 0.8), 
                    z: state.lastAnchor.z + (forwardZ * 0.8)
                };
            }
        }

        // ====================================================================
        // 4. MICRO-BRAKING (PHANH LƯỢNG TỬ ĐÓNG BĂNG ĐỘNG NĂNG)
        // ====================================================================
        if (payload.body_sway !== undefined) payload.body_sway = 0.0;
        
        // Triệt tiêu vận tốc truyền vào đạn ở chu kỳ bóp cò đầu tiên
        if (weaponState.triggerFired) {
            if (payload.velocity !== undefined) payload.velocity = { x: 0.0, y: 0.0, z: 0.0 };
            if (payload.acceleration !== undefined) payload.acceleration = { x: 0.0, y: 0.0, z: 0.0 };
            if (payload.speed !== undefined) payload.speed = 0.0;
            if (payload.is_moving !== undefined) payload.is_moving = false;
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
// MODULE 6: ONE-TAP CORE (LÕI SÁT THƯƠNG THIỆN XẠ - V8.0 MARKSMAN BLADE)
// Nhiệm vụ: Tối giản hóa, xóa bỏ logic rườm rà của súng bắn tỉa (AWM/M82B).
// Ép xung tuyệt đối cho súng lục nặng (DE) và súng trường thiện xạ (Woodpecker, SVD).
// ============================================================================
class OneTapCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;

        // --------------------------------------------------------------------
        // 1. TRIỆT TIÊU SAI SỐ VẬT LÝ (ABSOLUTE ZERO SPREAD & RECOIL)
        // --------------------------------------------------------------------
        if (payload.weapon) {
            // Ép độ chính xác tuyệt đối (Không nở tâm dù xả đạn liên tục)
            if (payload.weapon.base_spread !== undefined) payload.weapon.base_spread = 0.0;
            if (payload.weapon.dynamic_spread !== undefined) payload.weapon.dynamic_spread = 0.0;
            if (payload.weapon.max_spread !== undefined) payload.weapon.max_spread = 0.0;
            
            // Xóa nảy nòng (Recoil)
            if (payload.weapon.recoil_y !== undefined) payload.weapon.recoil_y = 0.0;
            if (payload.weapon.recoil_x !== undefined) payload.weapon.recoil_x = 0.0;
            
            // [ĐÃ XÓA BỎ]: Lệnh recoil_recovery = 9999.0 của súng bắn tỉa. 
            // Trả lại sự mượt mà tự nhiên cho các pha sấy/vẩy liên tiếp của SVD/AC80.

            // Xóa mọi hình phạt di chuyển (Hỗ trợ Jump-shot và Run-and-gun hoàn hảo)
            if (payload.weapon.inaccuracy_move !== undefined) payload.weapon.inaccuracy_move = 0.0;
            if (payload.weapon.inaccuracy_jump !== undefined) payload.weapon.inaccuracy_jump = 0.0;
            if (payload.weapon.inaccuracy_crouch !== undefined) payload.weapon.inaccuracy_crouch = 0.0;
        }

        // --------------------------------------------------------------------
        // 2. KHÓA TIA ĐẠN (MARKSMAN RAYCAST OVERRIDE)
        // --------------------------------------------------------------------
        // Cưỡng chế viên đạn găm thẳng vào lõi sọ dẫu M7 (Camera) có lỡ vẩy lệch vài pixel
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
                    // Gắn nhãn ID mục tiêu để Module 8 (Magic Bullet) biến hóa sát thương
                    bullet.target_id = targetState.id;
                }
            }
        }

        // --------------------------------------------------------------------
        // 3. THIẾT LẬP SÁT THƯƠNG TỬ THẦN (CROSS-MAP LETHALITY)
        // --------------------------------------------------------------------
        if (payload.damage_report) {
            // Ép Headshot tuyệt đối (Mã xương: 8)
            payload.damage_report.hit_bone = 8;
            payload.damage_report.is_headshot = true;
            
            // Xuyên giáp 100% - Biến mũ 3/4 của kẻ địch thành tờ giấy
            if (payload.damage_report.armor_penetration !== undefined) {
                payload.damage_report.armor_penetration = 1.0;
            }
            
            // Xóa bỏ khoảng cách giảm sát thương (Damage Falloff)
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
// MODULE 8: MAGIC BULLET CORE (LÕI ĐẠN MA THUẬT - V10.0 ABSOLUTE HITSCAN)
// Tích hợp: Zero-Time Raycast (Đạn đạo tức thời), Tụ đạn Shotgun (Slug-Shot), 
// Phân tách Đạn đạo, và Smart Anti-Overlap.
// ĐÃ XÓA BỎ: Tính toán Bù trừ Vận tốc và Xuyên tường (Ghost Penetration).
// ĐỒNG BỘ: Bắn thẳng vào không gian Hiện Tại Tuyệt Đối.
// ============================================================================
class MagicBulletCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;

        // Bỏ qua nếu M4 chưa cung cấp tọa độ của Hiện Tại Tuyệt Đối
        if (!targetState || !targetState.id || !targetState.pos) return payload;

        // ====================================================================
        // 1. NGHỊCH ĐẢO SINH TỬ (MISS-TO-HIT INVERSION)
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
        // 2. SMART ANTI-OVERLAP (THANH TRỪNG CHỌN LỌC)
        // ====================================================================
        if (payload.players && Array.isArray(payload.players)) {
            for (let i = 0; i < payload.players.length; i++) {
                let enemy = payload.players[i];
                if (enemy.id !== targetState.id && enemy.hitboxes) {
                    const bodyParts = ['head', 'chest', 'pelvis', 'legs', 'arms'];
                    for (let p = 0; p < bodyParts.length; p++) {
                        if (enemy.hitboxes[bodyParts[p]]) {
                            enemy.hitboxes[bodyParts[p]].radius = 0.01; 
                        }
                    }
                }
            }
        }

        // ====================================================================
        // 3. ZERO-TIME VECTOR (ĐƯỜNG ĐẠN HIỆN TẠI)
        // ====================================================================
        let perfectDir = null;
        // Điểm sinh đạn giờ đây cực kỳ chuẩn xác vì đã được M5 dời ra nòng súng
        let origin = payload.fire_origin || selfState.lastAnchor || selfState.anchorPos;
        
        if (origin && targetState.pos) {
            // Đích đến là Cái Đầu Hiện Tại. Không cần bù trừ, không cần lùi thời gian.
            let dest = { ...targetState.pos }; 
            
            let dx = dest.x - origin.x;
            let dy = dest.y - (payload.fire_origin ? origin.y : origin.y + 1.5); 
            let dz = dest.z - origin.z;
            
            const mag = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (mag > 0) perfectDir = { x: dx/mag, y: dy/mag, z: dz/mag };
        }

        // ====================================================================
        // 4. SLUG-SHOT & INERTIA NULLIFICATION (ĐÓNG BĂNG QUÁN TÍNH TỐI ĐA)
        // ====================================================================
        if (perfectDir && payload.bullet_events && Array.isArray(payload.bullet_events)) {
            for (let i = 0; i < payload.bullet_events.length; i++) {
                let bullet = payload.bullet_events[i];
                
                // Gán Vector Lượng giác tuyệt đối
                bullet.ray_dir = { ...perfectDir };
                bullet.target_id = targetState.id;
                
                // Triệt tiêu sai số ngẫu nhiên của vũ khí
                if (bullet.spread_angle !== undefined) bullet.spread_angle = 0.0;
                if (bullet.deviation !== undefined) bullet.deviation = 0.0;

                // [CẮT ĐỨT QUÁN TÍNH ENGINE]
                // Ngăn chặn Game Engine bóp méo đường đạn thẳng tắp của chúng ta.
                if (bullet.angular_velocity !== undefined) bullet.angular_velocity = 0.0;
                if (bullet.momentum_offset !== undefined) bullet.momentum_offset = 0.0;
                if (bullet.drift !== undefined) bullet.drift = 0.0;
                if (bullet.trajectory_curve !== undefined) bullet.trajectory_curve = 0.0;
                if (bullet.velocity_inheritance !== undefined) bullet.velocity_inheritance = 0.0;
                
                // [ĐÃ GỠ BỎ TÍNH NĂNG BÓNG MA/XUYÊN TƯỜNG ĐỂ AN TOÀN]
                // Đạn sẽ tuân thủ vật cản vật lý của map, nhưng chạm vào thịt là Headshot.
            }
        }

        // ====================================================================
        // 5. DAMAGE FINALIZATION (CHỐT HẠ SÁT THƯƠNG THUẦN TÚY)
        // ====================================================================
        if (payload.damage_report || payload.hit_event) {
            let report = payload.damage_report || payload.hit_event;
            
            report.target_id = targetState.id;
            report.hit_bone = 8; 
            report.is_headshot = true;
            
            // Ép Tọa độ va chạm (hit_pos) trùng khít với Không gian Hiện Tại
            report.hit_pos = { ...targetState.pos };
            if (report.ray_dir && perfectDir) report.ray_dir = { ...perfectDir };

            // Đục xuyên Giáp/Mũ & Xóa giảm sát thương tầm xa
            if (report.distance_penalty !== undefined) report.distance_penalty = 0.0;
            if (report.armor_penetration !== undefined) report.armor_penetration = 1.0;
            if (report.ignore_armor !== undefined) report.ignore_armor = true; 
            if (report.penetration_ratio !== undefined) report.penetration_ratio = 1.0; 
        }

        return payload;
    }
}

// ============================================================================
// BỘ ĐIỀU PHỐI TỔNG (MATRIX DISPATCHER V2.7 - ZERO PING EDITION)
// ============================================================================
class MatrixDispatcher {
    
    sanitizeTelemetry(obj) {
        if (!obj || typeof obj !== 'object') return obj;

        const blacklistedKeywords = ['report', 'hackkill', 'cheat', 'telemetry', 'exception', 'T_31_', 'T_33_', 'T_34_'];
        const keys = Object.keys(obj);
        
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const lowerKey = key.toLowerCase();

            if (blacklistedKeywords.some(keyword => lowerKey.includes(keyword))) {
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

        // ĐÃ XÓA: Bộ thu thập độ trễ mạng (Dynamic Latency Tracker)

        payload = this.sanitizeTelemetry(payload);
        payload = WeaponClassifier.processWeaponState(payload);

        if (_global.__OmniState.weaponProfile && _global.__OmniState.weaponProfile.Core !== "IGNORE") {
            payload = TargetKinematics.processTargetState(payload);
            payload = CameraManipulator.execute(payload);
            payload = TriggerCheck.evaluate(payload);
            payload = SelfKinematics.processSelfState(payload);

            const core = _global.__OmniState.weaponProfile.Core;
            if (core === "SHOTGUN") payload = ShotgunCore.execute(payload);
            else if (core === "AUTO") payload = AutoCore.execute(payload);
            else if (core === "ONETAP") payload = OneTapCore.execute(payload);

            payload = MagicBulletCore.execute(payload);
        }

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
