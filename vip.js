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
// MODULE 4: TARGET KINEMATICS (LÕI ĐỘNG HỌC MỤC TIÊU - V3.0 OMNISCIENT EYE)
// Tích hợp: Threat Matrix 3.0, Time-Shift Backtracking, Multi-Point Bone Scan.
// ============================================================================
class TargetKinematics {
    
    // Hàm chuẩn hóa góc để tính toán hướng nhìn của địch
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

        if (!payload || !payload.players || !Array.isArray(payload.players)) return payload;

        const selfState = _global.__OmniState.self;
        if (!selfState.anchorPos || selfState.anchorPos.x === 0) return payload; 

        let bestTarget = null;
        let lowestThreatScore = 999999.0;
        const currentYaw = payload.aim_yaw !== undefined ? payload.aim_yaw : (_global.__OmniState.camera.prevYaw || 0.0);
        if (payload.aim_yaw !== undefined) _global.__OmniState.camera.prevYaw = payload.aim_yaw;

        // ====================================================================
        // 2. SMART THREAT MATRIX 3.0 (MA TRẬN HIỂM HỌA THÔNG MINH)
        // ====================================================================
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

            let threatScore = distance3D; // Base score là khoảng cách

            // [TRỌNG SỐ 1]: KẺ ĐỊCH ĐANG NHÌN MÌNH (Look-at Vector)
            // Tính toán góc từ địch hướng về mình, so sánh với góc Camera của địch
            let angleToMe = Math.atan2(-dx, -dz) * (180.0 / Math.PI);
            let enemyYaw = enemy.aim_yaw || enemy.yaw || 0.0;
            let isLookingAtMe = Math.abs(this.normalizeAngle(enemyYaw - angleToMe)) < 30.0;
            
            if (isLookingAtMe) threatScore -= 200.0; // Ưu tiên giết kẻ đang ngắm mình trước

            // [TRỌNG SỐ 2]: ĐỘ NGUY HIỂM VŨ KHÍ
            if (enemy.weapon && enemy.weapon.category) {
                let cat = enemy.weapon.category.toUpperCase();
                if (cat.includes("SNIPER") || cat.includes("SHOTGUN")) threatScore -= 100.0;
                else if (cat.includes("MELEE") || cat.includes("GRENADE")) threatScore += 150.0; // Kệ bọn cầm dao
            }

            // [TRỌNG SỐ 3]: LƯỢNG MÁU VÀ FOV
            let angleToEnemy = Math.atan2(dx, dz) * (180.0 / Math.PI);
            let fovDiff = Math.abs(this.normalizeAngle(angleToEnemy - currentYaw));
            let fovPenalty = fovDiff * (distance3D < 10.0 ? 1.0 : 3.5);
            
            const hpMissingBonus = ((enemy.max_hp || 200.0) - (enemy.hp || 200.0)) * 0.8; 
            
            threatScore = threatScore + fovPenalty - hpMissingBonus;

            if (threatScore < lowestThreatScore) {
                lowestThreatScore = threatScore;
                bestTarget = enemy;
                bestTarget.distance = distance3D;
            }
        }

        // ====================================================================
        // 3. MULTI-POINT BONE SCANNING & TIME-SHIFT BACKTRACKING
        // ====================================================================
        if (bestTarget) {
            const targetState = _global.__OmniState.target;
            const tracker = _global.__OmniState.tracker;
            const currentTime = Date.now();

            targetState.id = bestTarget.id;
            targetState.distance = bestTarget.distance;
            
            // [GIAO THỨC ĐA ĐIỂM]: Quét quanh hộp sọ để lấy điểm lộ ra ngoài
            let headCenter = bestTarget.hitboxes?.head?.pos || { x: bestTarget.pos.x, y: bestTarget.pos.y + 1.5, z: bestTarget.pos.z };
            
            // Khởi tạo các điểm phụ: Tâm, Đỉnh đầu, Trái, Phải
            const scanPoints = [
                headCenter,
                { x: headCenter.x, y: headCenter.y + 0.12, z: headCenter.z }, // Top
                { x: headCenter.x + 0.15, y: headCenter.y, z: headCenter.z }, // Right Edge
                { x: headCenter.x - 0.15, y: headCenter.y, z: headCenter.z }  // Left Edge
            ];
            
            // Trong môi trường payload, chúng ta mặc định chọn điểm Tâm. 
            // Nếu phát hiện biến is_partially_hidden, chuyển sang bắn vào viền (Edge)
            let targetAimPos = scanPoints[0];
            if (bestTarget.is_partially_hidden) targetAimPos = scanPoints[1]; // Bắn sượt đỉnh đầu

            // Cận chiến thì khóa ngực chống văng
            if (bestTarget.distance <= 5.0 && bestTarget.hitboxes?.chest) {
                targetAimPos = bestTarget.hitboxes.chest.pos; 
            }
            
            targetState.pos = { ...targetAimPos };

            // ====================================================================
            // KHỞI TẠO BỘ NHỚ LỊCH SỬ (HISTORY BUFFER)
            // ====================================================================
            if (!tracker[bestTarget.id]) {
                tracker[bestTarget.id] = { 
                    history: [], 
                    velocity: {x:0, y:0, z:0}
                };
                targetState.predicted_pos = { ...targetAimPos }; 
            } 
            else {
                let trackData = tracker[bestTarget.id];
                
                // Cập nhật mảng lịch sử (Lưu tối đa 20 frames gần nhất)
                trackData.history.unshift({ pos: { ...targetAimPos }, time: currentTime });
                if (trackData.history.length > 20) trackData.history.pop();

                // Trích xuất Frame trước đó để tính Động lực học
                let prevFrame = trackData.history[1] || trackData.history[0];
                let dt = (currentTime - prevFrame.time) / 1000.0;
                
                if (dt > 0.0 && dt < 0.2) { 
                    let vx = (targetAimPos.x - prevFrame.pos.x) / dt;
                    let vy = (targetAimPos.y - prevFrame.pos.y) / dt;
                    let vz = (targetAimPos.z - prevFrame.pos.z) / dt;
                    let speed = Math.sqrt(vx*vx + vy*vy + vz*vz);

                    trackData.velocity = { x: vx, y: vy, z: vz };

                    // ====================================================================
                    // TIME-SHIFT BACKTRACKING (BẮN VÀO QUÁ KHỨ)
                    // ====================================================================
                    // Nếu kẻ địch chạy quá nhanh (lướt Tatsuya) hoặc vừa lách vào tường (Ziczac gắt)
                    // Chúng ta hủy dự đoán tương lai, và tua ngược thời gian lôi cái bóng của hắn về.
                    if (speed > 8.0 || bestTarget.is_behind_cover) {
                        let backtrackFrame = trackData.history[0];
                        // Tìm cái bóng cách đây khoảng 150 mili-giây
                        let targetTime = currentTime - 150; 
                        
                        for (let i = 0; i < trackData.history.length; i++) {
                            let frame = trackData.history[i];
                            if (Math.abs(frame.time - targetTime) < 50) {
                                backtrackFrame = frame;
                                break;
                            }
                        }
                        // Khóa điểm rơi vào cái bóng trong quá khứ
                        targetState.predicted_pos = { ...backtrackFrame.pos };
                    } 
                    // ====================================================================
                    // APEX PREDICTION (ĐÓN LÕNG TƯƠNG LAI)
                    // ====================================================================
                    // Nếu kẻ địch chạy bộ bình thường, áp dụng đón lõng
                    else {
                        const pingDelay = _global.__OmniState.currentPing / 1000.0;
                        let bulletSpeed = _global.__OmniState.weaponProfile.Core === "SHOTGUN" ? 400.0 : 850.0;
                        let extrapolationTime = (pingDelay + (bestTarget.distance / bulletSpeed));
                        if (extrapolationTime > 0.15) extrapolationTime = 0.15; 

                        let predX = targetAimPos.x + (vx * extrapolationTime);
                        let predZ = targetAimPos.z + (vz * extrapolationTime);
                        let predY = targetAimPos.y + (vy * extrapolationTime);

                        // Bù trừ trọng lực rơi nếu địch nhảy
                        if (Math.abs(vy) > 1.5 && speed <= 8.0) {
                            predY -= 0.5 * 9.8 * (extrapolationTime * extrapolationTime);
                        }
                        targetState.predicted_pos = { x: predX, y: predY, z: predZ };
                    }
                } else {
                    targetState.predicted_pos = { ...targetAimPos };
                }
            }
        } else {
            _global.__OmniState.target = { id: null, pos: null, predicted_pos: null, distance: 9999.0 };
        }

        return payload;
    }
}

// ============================================================================
// MODULE 7: CAMERA MANIPULATOR (LÕI ĐIỀU HƯỚNG THỊ GIÁC - V3.0 DUAL REALITY)
// Tích hợp: pSilent Aim (Gói tin), Adaptive ADS (Ống ngắm thích ứng),
// Visual Recoil Anchoring, và Desync Bypass. Màn hình mượt mà, Đạn đạo tử thần.
// ============================================================================
class CameraManipulator {
    
    static normalizeAngle(angle) {
        while (angle > 180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }

    // [GIỮ NGUYÊN BỘ LỌC CỦA V2.6 CHO CHẾ ĐỘ VISUAL TRACKING]
    static calculatePitchMultiplier(distance) {
        if (distance <= 2.0) return 4.0; 
        if (distance <= 10.0) {
            let t = (distance - 2.0) / 8.0; 
            return 4.0 - (3.0 * t); 
        }
        if (distance <= 50.0) {
            let t = (distance - 10.0) / 40.0;
            return 1.0 - (0.85 * t);
        }
        return 0.05;
    }

    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;
        const camState = _global.__OmniState.camera;
        const weaponState = _global.__OmniState.weapon;
        const profile = _global.__OmniState.weaponProfile || { Core: "IGNORE" };

        if (!targetState.id || !targetState.predicted_pos || payload.aim_yaw === undefined) return payload;

        // Trích xuất trạng thái hành vi hiện tại
        const isFiring = weaponState.isFiring || weaponState.triggerFired || payload.is_firing;
        const isScoping = payload.is_scoping || (payload.weapon && payload.weapon.is_scoping);

        // ====================================================================
        // 1. TOÁN HỌC KHÔNG GIAN: GÓC NGẮM LƯỢNG TỬ (ABSOLUTE VECTOR)
        // ====================================================================
        const origin = { x: selfState.anchorPos.x, y: selfState.anchorPos.y + 1.5, z: selfState.anchorPos.z };
        const dest = targetState.predicted_pos;

        const dx = dest.x - origin.x;
        const dy = dest.y - origin.y;
        const dz = dest.z - origin.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz);

        let trueYaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
        let truePitch = Math.atan2(-dy, distXZ) * (180.0 / Math.PI);

        // ====================================================================
        // 2. VISUAL RECOIL ANCHORING (Neo góc nhìn chống giật hình ảnh)
        // ====================================================================
        // Chủ động trừ đi tích lũy độ nảy Camera của Game Engine để giữ tia pSilent thẳng tắp
        if (payload.weapon && payload.weapon.recoil_accumulation !== undefined) {
            const recoil = payload.weapon.recoil_accumulation;
            truePitch -= (recoil * 1.35); 
        }

        const currentYaw = payload.aim_yaw;
        const currentPitch = payload.aim_pitch;

        // ====================================================================
        // THỰC TẠI A: LÃNH ĐỊA NETWORK - TRUE pSILENT AIM (Chỉ chạy khi Bóp Cò)
        // ====================================================================
        if (isFiring) {
            // Ép thẳng góc lượng tử vào gói tin bay lên Máy chủ (Tốc độ 0ms)
            payload.aim_yaw = this.normalizeAngle(trueYaw);
            payload.aim_pitch = this.normalizeAngle(truePitch);

            if (payload.camera_state) {
                payload.camera_state.yaw = payload.aim_yaw;
                payload.camera_state.pitch = payload.aim_pitch;
                
                // SUB-TICK DESYNC BYPASS: 
                // Cưỡng chế Engine C++ nội suy theo tọa độ XYZ để Máy chủ không hủy sát thương
                payload.camera_state.target_x = dest.x;
                payload.camera_state.target_y = dest.y;
                payload.camera_state.target_z = dest.z;
            }
            
            // Không cập nhật camState (PID) để màn hình người chơi không bị kéo giật theo
            return payload; 
        }

        // ====================================================================
        // THỰC TẠI B: LÃNH ĐỊA VISUAL - ADAPTIVE LERPING (Khi đang ngắm/chạy bộ)
        // ====================================================================
        const currentTime = Date.now();
        let dt = (currentTime - camState.lastTime) / 1000.0;
        if (dt <= 0.0 || dt > 0.1) dt = 0.016; 
        camState.lastTime = currentTime;

        let errorYaw = this.normalizeAngle(trueYaw - currentYaw);
        let errorPitch = this.normalizeAngle(truePitch - currentPitch);

        // Giữ Aim-step chống lật màn hình trừ khi đang bật Scope
        if (Math.abs(errorYaw) > 45.0 && !isScoping) {
            camState.integralYaw = 0; camState.integralPitch = 0;
            return payload; 
        }

        let Kp_yaw = 6.8, Kp_pitch = 6.8;
        let Ki = 0.015;
        let Kd_yaw = 0.35, Kd_pitch = 0.35;
        let maxSpeed = 55.0; 
        let deadzone = 0.4;  

        // --------------------------------------------------------------------
        // 3. ADAPTIVE ADS FRAMEWORK (Khung ngắm thích ứng)
        // --------------------------------------------------------------------
        if (profile.Core === "ONETAP" && isScoping) {
            // Chế độ Sniper bật Scope: Tắt Lerping mềm, chuyển sang Absolute Snap-Aim ảo
            Kp_yaw = 40.0; 
            Kp_pitch = 40.0;
            Kd_yaw = 0.1; Kd_pitch = 0.1;
            maxSpeed = 400.0; // Cho phép ống ngắm vẩy (Flick) với tốc độ ánh sáng
            deadzone = 0.05;
        } 
        else {
            // Chế độ súng sấy (AR/SMG) hoặc Hip-fire: Chạy thuật toán Lerp V2.6 cũ để giấu hành vi
            let pitchMultiplier = this.calculatePitchMultiplier(targetState.distance);
            Kp_pitch *= pitchMultiplier; 

            if (targetState.distance <= 5.0) {
                Kp_yaw = 18.0; Kd_yaw = 0.98; Kd_pitch = 0.98; maxSpeed = 150.0; deadzone = 1.5;      
            } else if (targetState.distance > 50.0) {
                Kp_yaw = 3.0; Kd_yaw = 0.1; Kd_pitch = 0.1; maxSpeed = 25.0; deadzone = 0.15;      
            }
            if (targetState.distance > 10.0 && Math.abs(errorPitch) < 1.5) Kd_pitch = 2.0; 
        }

        if (Math.abs(errorYaw) < deadzone && Math.abs(errorPitch) < deadzone) {
            camState.integralYaw = 0; camState.integralPitch = 0;
            return payload;
        }

        camState.integralYaw += errorYaw * dt;
        let derivYaw = (errorYaw - camState.prevErrorYaw) / dt;
        let outputYaw = (errorYaw * Kp_yaw) + (camState.integralYaw * Ki) + (derivYaw * Kd_yaw);

        camState.integralPitch += errorPitch * dt;
        let derivPitch = (errorPitch - camState.prevErrorPitch) / dt;
        let outputPitch = (errorPitch * Kp_pitch) + (camState.integralPitch * Ki) + (derivPitch * Kd_pitch);

        if (targetState.distance > 10.0 && !(profile.Core === "ONETAP" && isScoping)) {
            let maxPitchStep = errorPitch / dt;
            if (Math.abs(outputPitch) > Math.abs(maxPitchStep)) outputPitch = maxPitchStep * 0.9; 
        }

        camState.prevErrorYaw = errorYaw;
        camState.prevErrorPitch = errorPitch;

        const maxDegPerFrame = maxSpeed * dt; 
        outputYaw = Math.max(-maxDegPerFrame, Math.min(maxDegPerFrame, outputYaw * dt));
        outputPitch = Math.max(-maxDegPerFrame, Math.min(maxDegPerFrame, outputPitch * dt));

        payload.aim_yaw = this.normalizeAngle(currentYaw + outputYaw);
        payload.aim_pitch = this.normalizeAngle(currentPitch + outputPitch);

        // Trong lúc Lerping (không bắn), xóa bỏ các biến target_xyz để trả quyền 
        // xử lý màn hình hiển thị lại cho Engine, đảm bảo sự mượt mà.
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
// MODULE 6.5: TRIGGER CHECK (BỘ LỌC ĐỒNG BỘ & ĐAO PHỦ TÀNG HÌNH - V3.0)
// Tích hợp: Perfect Sync Interceptor, Hitchance Engine, Predictive Pre-fire.
// ============================================================================
class TriggerCheck {
    static evaluate(payload) {
        const targetState = _global.__OmniState.target;
        const weaponState = _global.__OmniState.weapon;
        const profile = _global.__OmniState.weaponProfile;

        // 1. KHỞI TẠO CHU KỲ (Reset trạng thái của Tick trước)
        weaponState.triggerFired = false;
        
        // Bỏ qua nếu vũ khí không hỗ trợ (Lựu đạn/Cận chiến/Tay không)
        if (profile.Core === "IGNORE") return payload;

        // Trạng thái gốc: Người chơi có đang CỐ TÌNH bấm nút bắn trên màn hình không?
        let isManualFiring = payload.is_firing || (payload.weapon && payload.weapon.is_firing);

        // ====================================================================
        // 2. PERFECT SYNC INTERCEPTOR (Khóa Cò Đồng Bộ)
        // ====================================================================
        // Nếu M4 chưa tìm thấy cái bóng nào hợp lệ, hoặc địch đã hoàn toàn out-range.
        if (!targetState.id || !targetState.predicted_pos) {
            
            // NẾU người chơi đang bấm bắn -> ĐÁNH CHẶN GÓI TIN (Fire-Delay)
            // Hệ thống tước quyền nổ súng để không phí đạn vào không khí, chờ M4 khóa xong.
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
        let isTargetBehindCover = tracker.is_behind_cover || false; // Cờ giả định từ Engine
        let isWallBanging = false;

        if (isTargetBehindCover) {
            // Nếu địch nấp kín và bạn cầm súng sấy (AR/SMG) -> Tỷ lệ trúng = 0%
            if (profile.Core !== "ONETAP") {
                hitchance = 0.0; 
            } 
            // Nếu bạn cầm súng bắn tỉa xuyên tường (như M82B) -> Bật chế độ đục tường
            else if (profile.Core === "ONETAP") {
                isWallBanging = true; 
            }
        }

        // TƯỚC QUYỀN NỔ SÚNG NẾU TỶ LỆ TRÚNG BẰNG 0
        if (hitchance === 0.0) {
            payload.is_firing = false;
            if (payload.weapon) payload.weapon.is_firing = false;
            weaponState.isFiring = false;
            return payload; // Khóa cò thành công, không cho nổ súng
        }

        // ====================================================================
        // 4. PREDICTIVE PRE-FIRE (Đón Lõng Tiên Đoán)
        // ====================================================================
        let shouldAutoFire = false;
        
        if (tracker.velocity) {
            // Đo đạc tốc độ di chuyển ngang của kẻ địch
            const speed = Math.sqrt(tracker.velocity.x**2 + tracker.velocity.z**2);
            
            // TRƯỜNG HỢP A: Kẻ địch đang lướt nhanh ra khỏi vật cản (Vận tốc > 4.0 m/s)
            // M4 đã báo cáo là "partially hidden" (lộ một phần). Tự động cướp cò đón lõng!
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
        // 5. THỰC THI ÁN TỬ (Execution Command)
        // ====================================================================
        // Chốt hạ: Chỉ bắn khi Người chơi bấm đúng nhịp, HOẶC Hệ thống tự động Pre-fire
        if (isManualFiring || shouldAutoFire) {
            
            // Tiêm cờ khai hỏa vào gói tin bay lên Server
            payload.is_firing = true;
            if (payload.weapon) {
                payload.weapon.is_firing = true;
                
                // Loại bỏ delay tích tụ của súng (Ví dụ: Charge Buster, súng sạc năng lượng)
                if (payload.weapon.charge_time !== undefined) payload.weapon.charge_time = 9999.0;
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
// MODULE 5: SELF KINEMATICS (LÕI ĐỘNG HỌC BẢN THÂN - V3.0 PHANTOM GHOST)
// Tích hợp: Absolute Zero-Vector, Tick-Choking (Fake Lag), 
// Airborne/Stance Override, và Anchor Rooting (Đóng băng rễ).
// ============================================================================
class SelfKinematics {
    static processSelfState(payload) {
        const state = _global.__OmniState.self;
        const weaponState = _global.__OmniState.weapon;
        
        // Bắt luồng tín hiệu Khai hỏa (Từ Trigger đồng bộ hoặc Người chơi)
        const isFiring = weaponState.isFiring || weaponState.triggerFired || payload.is_firing;

        // Khởi tạo Bộ nhớ đệm Bóng Ma (Ghost Buffer)
        if (state.tickCounter === undefined) state.tickCounter = 0;
        if (state.ghostPos === undefined) state.ghostPos = null;
        if (state.ghostAnchor === undefined) state.ghostAnchor = null;
        if (state.anchoredFireOrigin === undefined) state.anchoredFireOrigin = null;

        // ====================================================================
        // TRẠNG THÁI NGHỈ: LƯU VẾT QUÁ KHỨ (GHOST TRACKING)
        // ====================================================================
        if (!isFiring) {
            // Reset bộ đếm Fake Lag và mở khóa tọa độ đạn
            state.tickCounter = 0;
            state.isPerfectlyStill = false;
            state.anchoredFireOrigin = null;
            
            // Liên tục cập nhật tọa độ thành "Cái bóng" khi đang chạy nhảy/đu Zipline
            if (payload.pos !== undefined) state.ghostPos = { ...payload.pos };
            if (payload.anchorPos !== undefined) state.ghostAnchor = { ...payload.anchorPos };
            
            return payload; // Trả gói tin đi bình thường để giữ kết nối mượt mà
        }

        // ====================================================================
        // TRẠNG THÁI KHAI HỎA: KÍCH HOẠT LÃNH ĐỊA BẤT TỬ (PHANTOM REALITY)
        // ====================================================================
        state.tickCounter++;
        state.isPerfectlyStill = true;

        // --------------------------------------------------------------------
        // 1. ABSOLUTE ZERO-VECTOR & AIRBORNE OVERRIDE
        // --------------------------------------------------------------------
        // Cắt đứt hoàn toàn Động lực học. Dù bạn đang trượt ngang hay rơi tự do,
        // Server sẽ bị ép phải tin rằng bạn đang đứng tĩnh tuyệt đối.
        if (payload.velocity !== undefined) {
            payload.velocity.x = 0.0;
            payload.velocity.y = 0.0;
            payload.velocity.z = 0.0;
        }
        if (payload.speed !== undefined) payload.speed = 0.0;
        if (payload.is_airborne !== undefined) payload.is_airborne = false;
        if (payload.is_moving !== undefined) payload.is_moving = false;
        
        // Ép tư thế (Stance) về Đứng im (0) để hưởng độ chính xác (Accuracy) tối đa
        if (payload.stance !== undefined) payload.stance = 0; 

        // --------------------------------------------------------------------
        // 2. ANCHOR ROOTING (Đóng Băng Rễ)
        // --------------------------------------------------------------------
        // Xóa sổ vi sai nhịp thở cơ thể (Body Sway)
        if (payload.body_sway !== undefined) payload.body_sway = 0.0;
        
        // Neo giữ chặt điểm sinh đạn (Fire Origin) vào 1 tọa độ tĩnh duy nhất
        if (payload.fire_origin !== undefined) {
            if (!state.anchoredFireOrigin && state.ghostAnchor) {
                // Lấy cái bóng Anchor ở frame ngay trước khi bắn làm tâm sinh đạn
                state.anchoredFireOrigin = { 
                    x: state.ghostAnchor.x, 
                    y: state.ghostAnchor.y + 1.5, // Nâng lên ngang tầm mắt/nòng súng
                    z: state.ghostAnchor.z 
                };
            }
            if (state.anchoredFireOrigin) {
                payload.fire_origin.x = state.anchoredFireOrigin.x;
                payload.fire_origin.y = state.anchoredFireOrigin.y;
                payload.fire_origin.z = state.anchoredFireOrigin.z;
            }
        }

        // --------------------------------------------------------------------
        // 3. TICK-CHOKING & FAKE LAG (Thao Túng Tọa Độ Thực Tế)
        // --------------------------------------------------------------------
        // Trong khoảng 10 Ticks đầu tiên nổ súng (tương đương ~150 mili-giây),
        // thay vì gửi tọa độ thật của bạn lên Máy chủ, hệ thống sẽ gửi Tọa độ Bóng Ma.
        if (state.tickCounter < 10) { 
            if (payload.pos !== undefined && state.ghostPos) {
                payload.pos.x = state.ghostPos.x;
                payload.pos.y = state.ghostPos.y;
                payload.pos.z = state.ghostPos.z;
            }
            if (payload.anchorPos !== undefined && state.ghostAnchor) {
                payload.anchorPos.x = state.ghostAnchor.x;
                payload.anchorPos.y = state.ghostAnchor.y;
                payload.anchorPos.z = state.ghostAnchor.z;
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 2: SHOTGUN CORE (LÕI SÁT THƯƠNG CẬN CHIẾN - V3.0 QUANTUM BUCKSHOT)
// Tích hợp: Quantum Pellet Choking (Gom đạn lượng tử), Pump-action Overclock, 
// Hitscan Injection (Vận tốc ánh sáng), và Infinite Range Bypass.
// ============================================================================
class ShotgunCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;

        // --------------------------------------------------------------------
        // 1. ĐÓNG BĂNG VẬT LÝ & ÉP XUNG BƠM ĐẠN (PUMP-ACTION OVERCLOCK)
        // --------------------------------------------------------------------
        if (payload.weapon) {
            // Xóa sổ hoàn toàn độ giật cơ học
            if (payload.weapon.recoil_y !== undefined) payload.weapon.recoil_y = 0.0;
            if (payload.weapon.recoil_x !== undefined) payload.weapon.recoil_x = 0.0;
            if (payload.weapon.recoil_accumulation !== undefined) payload.weapon.recoil_accumulation = 0.0;
            
            // [GIAO THỨC SEED-LOCKING]: Khóa hạt giống phân tán
            if (payload.weapon.base_spread !== undefined) payload.weapon.base_spread = 0.0;
            if (payload.weapon.dynamic_spread !== undefined) payload.weapon.dynamic_spread = 0.0;
            if (payload.weapon.max_spread !== undefined) payload.weapon.max_spread = 0.0;

            // [GIAO THỨC OVERCLOCK]: Bẻ gãy giới hạn Tốc độ bắn
            // Biến khẩu súng pump-action (bắn từng viên) thành súng liên thanh
            if (payload.weapon.refire_delay !== undefined) payload.weapon.refire_delay = 0.0;
            if (payload.weapon.charge_time !== undefined) payload.weapon.charge_time = 0.0;
            if (payload.weapon.animation_lock !== undefined) payload.weapon.animation_lock = false;
            
            // Ghi đè Tốc độ xả đạn lên mức tối đa của Engine
            if (payload.weapon.fire_rate !== undefined) payload.weapon.fire_rate = 999.0; 
        }

        // --------------------------------------------------------------------
        // 2. GOM ĐẠN LƯỢNG TỬ & TIÊM VẬN TỐC ÁNH SÁNG (HITSCAN INJECTION)
        // --------------------------------------------------------------------
        // Súng Shotgun bắn ra nhiều mảnh đạn (pellets). Vòng lặp này bắt từng 
        // mảnh đạn một, nắn thẳng và bơm siêu năng lượng vào chúng.
        if (payload.bullet_events && Array.isArray(payload.bullet_events)) {
            
            let perfectDir = null;

            // Chỉ tính toán Vector 1 lần duy nhất cho toàn bộ chùm đạn
            if (targetState.id && targetState.predicted_pos && selfState.anchorPos) {
                const origin = selfState.anchorPos;
                const dest = targetState.predicted_pos;
                
                let dx = dest.x - origin.x;
                let dy = dest.y - origin.y;
                let dz = dest.z - origin.z;
                
                const mag = Math.sqrt(dx*dx + dy*dy + dz*dz);
                perfectDir = { x: dx/mag, y: dy/mag, z: dz/mag };
            }

            for (let i = 0; i < payload.bullet_events.length; i++) {
                let pellet = payload.bullet_events[i];
                
                if (perfectDir) {
                    // [GIAO THỨC QUANTUM CHOKING]: Cưỡng chế mọi mảnh đạn găm vào 1 Sub-pixel
                    if (pellet.ray_dir) pellet.ray_dir = { ...perfectDir };
                    pellet.target_id = targetState.id;
                }

                // [GIAO THỨC HITSCAN]: Tiêm vận tốc ánh sáng
                if (pellet.speed !== undefined) pellet.speed = 99999.0;
                if (pellet.time_to_target !== undefined) pellet.time_to_target = 0.0;
                
                // Bổ sung khả năng đục xuyên vật cản (Auto-wall) cho từng hạt đạn
                if (pellet.collision_obstacle !== undefined) pellet.collision_obstacle = false;
                if (pellet.is_penetrating !== undefined) pellet.is_penetrating = true;
            }
        }

        // --------------------------------------------------------------------
        // 3. INFINITE RANGE BYPASS (XÓA BỎ GIỚI HẠN TẦM XA)
        // --------------------------------------------------------------------
        if (payload.damage_report) {
            // Tước bỏ hình phạt cự ly (Damage Falloff)
            if (payload.damage_report.distance_penalty !== undefined) payload.damage_report.distance_penalty = 0.0;
            
            // Ép cự ly hiệu quả lên mức vô hạn
            if (payload.damage_report.effective_range !== undefined) payload.damage_report.effective_range = 9999.0;
            if (payload.damage_report.damage_dropoff !== undefined) payload.damage_report.damage_dropoff = 0.0;
            
            // Ép xuyên giáp tối đa cho từng mảnh đạn (Bỏ qua Mũ 3/4)
            if (payload.damage_report.armor_penetration !== undefined) payload.damage_report.armor_penetration = 1.0; 
        }

        // Đồng bộ các chỉ số tử thần này cho cả hit_event (Dự phòng Engine xử lý kép)
        if (payload.hit_event) {
            if (payload.hit_event.distance_penalty !== undefined) payload.hit_event.distance_penalty = 0.0;
            if (payload.hit_event.armor_penetration !== undefined) payload.hit_event.armor_penetration = 1.0;
        }

        return payload;
    }
}

// ============================================================================
// MODULE 3: AUTO CORE (LÕI SÁT THƯƠNG LIÊN THANH - V3.0 LASER STREAM)
// Tích hợp: Sub-Pixel Seed Locking, Hitscan Stream Injection (Vận tốc ánh sáng), 
// Fire-Rate Overclock (Ép xung nhịp bắn), và Absolute Penetration.
// ============================================================================
class AutoCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;

        // --------------------------------------------------------------------
        // 1. ÉP XUNG NHỊP BẮN & TRIỆT TIÊU VẬT LÝ (TTK MINIMIZATION)
        // --------------------------------------------------------------------
        if (payload.weapon) {
            // [GIAO THỨC SEED-LOCKING]: Xóa sổ hoàn toàn sự nhiễu loạn hạt giống
            // Đảm bảo viên đạn thứ 40 bay chuẩn xác hệt như viên đạn đầu tiên
            if (payload.weapon.recoil_y !== undefined) payload.weapon.recoil_y = 0.0;
            if (payload.weapon.recoil_x !== undefined) payload.weapon.recoil_x = 0.0;
            if (payload.weapon.recoil_accumulation !== undefined) payload.weapon.recoil_accumulation = 0.0;
            
            if (payload.weapon.base_spread !== undefined) payload.weapon.base_spread = 0.0;
            if (payload.weapon.dynamic_spread !== undefined) payload.weapon.dynamic_spread = 0.0;
            if (payload.weapon.max_spread !== undefined) payload.weapon.max_spread = 0.0;
            if (payload.weapon.spread_add_per_shot !== undefined) payload.weapon.spread_add_per_shot = 0.0;

            // Xóa sai số cơ học của nhân vật
            if (payload.weapon.inaccuracy_move !== undefined) payload.weapon.inaccuracy_move = 0.0;
            if (payload.weapon.inaccuracy_jump !== undefined) payload.weapon.inaccuracy_jump = 0.0;
            if (payload.weapon.inaccuracy_crouch !== undefined) payload.weapon.inaccuracy_crouch = 0.0;

            // [GIAO THỨC OVERCLOCK]: Vượt rào giới hạn nhịp bắn của Engine
            // Xóa bỏ thời gian chờ giữa các viên đạn, ép xả đạn ở mức tối đa của Máy chủ
            if (payload.weapon.fire_rate !== undefined) payload.weapon.fire_rate = 999.0;
            if (payload.weapon.refire_delay !== undefined) payload.weapon.refire_delay = 0.0;
        }

        // --------------------------------------------------------------------
        // 2. DÒNG CHẢY ÁNH SÁNG & XUYÊN THẤU (HITSCAN STREAM)
        // --------------------------------------------------------------------
        // Xử lý đệ quy mảng đạn liên thanh được sinh ra trong Tick hiện tại
        if (payload.bullet_events && Array.isArray(payload.bullet_events)) {
            
            let perfectDir = null;
            
            // Tính toán Vector lượng tử 1 lần duy nhất cho toàn bộ băng đạn
            if (targetState.id && targetState.predicted_pos && selfState.anchorPos) {
                const origin = selfState.anchorPos;
                const dest = targetState.predicted_pos;
                
                let dx = dest.x - origin.x;
                let dy = dest.y - origin.y;
                let dz = dest.z - origin.z;
                const mag = Math.sqrt(dx*dx + dy*dy + dz*dz);
                if (mag > 0) perfectDir = { x: dx/mag, y: dy/mag, z: dz/mag };
            }

            for (let i = 0; i < payload.bullet_events.length; i++) {
                let bullet = payload.bullet_events[i];
                
                if (perfectDir && bullet.ray_dir) {
                    bullet.ray_dir = { ...perfectDir };
                }
                bullet.target_id = targetState.id;

                // [GIAO THỨC HITSCAN]: Biến đạn vật lý thành tia Laser
                // Đạn chạm sọ mục tiêu trong 0.0 giây, bỏ qua thời gian di chuyển
                if (bullet.speed !== undefined) bullet.speed = 99999.0;
                if (bullet.time_to_target !== undefined) bullet.time_to_target = 0.0;

                // [GIAO THỨC AUTO-WALL]: Cấp quyền đục xuyên mọi vật cản (Keo/Tường/Đá)
                if (bullet.collision_obstacle !== undefined) bullet.collision_obstacle = false;
                if (bullet.is_penetrating !== undefined) bullet.is_penetrating = true;
            }
        }

        // --------------------------------------------------------------------
        // 3. XÉ GIÁP TUYỆT ĐỐI (ABSOLUTE ARMOR BYPASS)
        // --------------------------------------------------------------------
        if (payload.damage_report) {
            payload.damage_report.hit_bone = 8;
            payload.damage_report.is_headshot = true;

            // Cưỡng chế hệ số xuyên 100% Giáp/Mũ cho dòng súng AR/SMG
            if (payload.damage_report.armor_penetration !== undefined) {
                payload.damage_report.armor_penetration = 1.0; 
            }

            // Súng sấy không bao giờ bị yếu đi khi bắn ở tầm xa
            if (payload.damage_report.distance_penalty !== undefined) {
                payload.damage_report.distance_penalty = 0.0;
            }
        }
        
        // Dự phòng đồng bộ cho hit_event (Bypass kiểm tra chéo của Server)
        if (payload.hit_event) {
            if (payload.hit_event.armor_penetration !== undefined) payload.hit_event.armor_penetration = 1.0;
            if (payload.hit_event.distance_penalty !== undefined) payload.hit_event.distance_penalty = 0.0;
        }

        return payload;
    }
}

// ============================================================================
// MODULE 6: ONE-TAP CORE (LÕI SÁT THƯƠNG GÕ NHỊP NHANH - V3.0 EXECUTIONER)
// Tích hợp: Absolute Zero-Bloom, Semi-to-Auto Overclock, 
// Pocket-Sniper Bypass, và Hitscan Execution. Dành cho M500, Deagle, M590...
// ============================================================================
class OneTapCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;

        // --------------------------------------------------------------------
        // 1. ĐÓNG BĂNG TÂM LƯỢNG TỬ & ÉP XUNG CÒ SÚNG
        // --------------------------------------------------------------------
        if (payload.weapon) {
            // [GIAO THỨC ZERO-BLOOM]: Xóa sổ hoàn toàn độ nở tâm khi spam click
            if (payload.weapon.base_spread !== undefined) payload.weapon.base_spread = 0.0;
            if (payload.weapon.dynamic_spread !== undefined) payload.weapon.dynamic_spread = 0.0;
            if (payload.weapon.max_spread !== undefined) payload.weapon.max_spread = 0.0;
            
            // Hồi tâm tức thì: Giữ màn hình tĩnh lặng tuyệt đối sau mỗi phát bắn
            // Ngăn chặn việc màn hình bị giật ngược lên trời khi gõ M590 hoặc Woodpecker
            if (payload.weapon.recoil_recovery !== undefined) payload.weapon.recoil_recovery = 9999.0;
            if (payload.weapon.recoil_y !== undefined) payload.weapon.recoil_y = 0.0;
            if (payload.weapon.recoil_x !== undefined) payload.weapon.recoil_x = 0.0;

            // [GIAO THỨC SEMI-TO-AUTO OVERCLOCK]: Mở khóa giới hạn nhịp bắn
            // Biến súng gõ 1 viên thành súng liên thanh khi giữ cò
            if (payload.weapon.refire_delay !== undefined) payload.weapon.refire_delay = 0.0;
            if (payload.weapon.fire_rate !== undefined) payload.weapon.fire_rate = 999.0;
            
            // Ép cờ tự động hoàn toàn (Full-Auto) nếu Game Engine hỗ trợ
            if (payload.weapon.is_full_auto !== undefined) payload.weapon.is_full_auto = true; 

            // Xóa hình phạt di chuyển
            if (payload.weapon.inaccuracy_move !== undefined) payload.weapon.inaccuracy_move = 0.0;
            if (payload.weapon.inaccuracy_jump !== undefined) payload.weapon.inaccuracy_jump = 0.0;
        }

        // --------------------------------------------------------------------
        // 2. HITSCAN EXECUTION (TIÊM VẬN TỐC ÁNH SÁNG)
        // --------------------------------------------------------------------
        if (payload.bullet_events && Array.isArray(payload.bullet_events)) {
            let perfectDir = null;

            if (targetState.id && targetState.predicted_pos && selfState.anchorPos) {
                const origin = selfState.anchorPos;
                const dest = targetState.predicted_pos;
                
                let dx = dest.x - origin.x;
                let dy = dest.y - origin.y;
                let dz = dest.z - origin.z;
                
                const mag = Math.sqrt(dx*dx + dy*dy + dz*dz);
                perfectDir = { x: dx/mag, y: dy/mag, z: dz/mag };
            }

            for (let i = 0; i < payload.bullet_events.length; i++) {
                let bullet = payload.bullet_events[i];
                
                if (perfectDir && bullet.ray_dir) {
                    bullet.ray_dir = { ...perfectDir };
                }
                bullet.target_id = targetState.id;

                // [GIAO THỨC HITSCAN]: Xóa bỏ thời gian bay của đạn
                if (bullet.speed !== undefined) bullet.speed = 99999.0;
                if (bullet.time_to_target !== undefined) bullet.time_to_target = 0.0;

                // [XUYÊN THẤU]: Súng lục đục tường như M82B
                if (bullet.collision_obstacle !== undefined) bullet.collision_obstacle = false;
                if (bullet.is_penetrating !== undefined) bullet.is_penetrating = true;
            }
        }

        // --------------------------------------------------------------------
        // 3. POCKET-SNIPER BYPASS & ONE-SHOT KILL
        // --------------------------------------------------------------------
        if (payload.damage_report) {
            // [TRẢM THỦ]: Ép mã xương sọ và cờ Headshot
            payload.damage_report.hit_bone = 8;
            payload.damage_report.is_headshot = true;
            
            // Xuyên giáp tuyệt đối
            if (payload.damage_report.armor_penetration !== undefined) {
                payload.damage_report.armor_penetration = 1.0;
            }
            
            // [GIAO THỨC POCKET-SNIPER]: Giữ nguyên sát thương gốc ở khoảng cách vô hạn
            // Biến khẩu súng lục thành một khẩu súng bắn tỉa hạng nặng
            if (payload.damage_report.distance_penalty !== undefined) {
                payload.damage_report.distance_penalty = 0.0;
            }
            if (payload.damage_report.effective_range !== undefined) {
                payload.damage_report.effective_range = 9999.0;
            }
            if (payload.damage_report.damage_dropoff !== undefined) {
                payload.damage_report.damage_dropoff = 0.0;
            }
        }

        // Đồng bộ thuộc tính tử thần cho hit_event
        if (payload.hit_event) {
            if (payload.hit_event.distance_penalty !== undefined) payload.hit_event.distance_penalty = 0.0;
            if (payload.hit_event.armor_penetration !== undefined) payload.hit_event.armor_penetration = 1.0;
        }

        return payload;
    }
}

// ============================================================================
// MODULE 8: MAGIC BULLET CORE (LÕI ĐẠN MA THUẬT - V3.0 ABSOLUTE SENTENCE)
// Tích hợp: Magnetic Raycast, Hitbox Purge (Xóa sổ Overlap), 
// Miss-to-Hit Inversion, và Absolute Bone Override & Sync.
// Lưu ý: Đã gỡ bỏ giới hạn FOV của V2.6 để tương thích hoàn toàn với pSilent Aim.
// ============================================================================
class MagicBulletCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;

        // Bỏ qua nếu M4 chưa cung cấp tọa độ tĩnh của cái bóng (Ghost)
        if (!targetState || !targetState.id || !targetState.predicted_pos) return payload;

        // ====================================================================
        // 1. NGHỊCH ĐẢO SINH TỬ (MISS-TO-HIT INVERSION)
        // ====================================================================
        // Bắt cóc sự kiện trượt đạn do lỗi Game Engine hoặc Ping cao, 
        // cưỡng chế ép nó thành một sự kiện trúng đích (Hit Event).
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
        // 2. THANH TRỪNG THỂ XÁC (HITBOX PURGE / ANTI-OVERLAP)
        // ====================================================================
        if (payload.players && Array.isArray(payload.players)) {
            for (let i = 0; i < payload.players.length; i++) {
                let enemy = payload.players[i];
                
                if (enemy.hitboxes) {
                    const bodyParts = ['head', 'chest', 'pelvis', 'legs', 'arms'];
                    for (let p = 0; p < bodyParts.length; p++) {
                        let part = bodyParts[p];
                        if (enemy.hitboxes[part]) {
                            // [GIAO THỨC THANH TRỪNG]: Bóp nát mọi Hitbox xuống 0.01 mét.
                            // Không còn ai có Hitbox to 50m nữa. Cơ thể kẻ địch giờ mỏng như tờ giấy.
                            // Điều này cho phép tia Magnetic Raycast đâm xuyên qua đám đông
                            // và 100% không bao giờ kẹt sát thương vào tay/chân kẻ đứng chắn phía trước.
                            enemy.hitboxes[part].radius = 0.01; 
                        }
                    }
                }
            }
        }

        // ====================================================================
        // 3. TỪ TRƯỜNG BẺ CONG TIA CHIẾU (MAGNETIC RAYCAST)
        // ====================================================================
        let perfectDir = null;
        if (selfState.anchorPos) {
            // Nối thẳng điểm phát đạn với cái bóng quá khứ của kẻ địch
            let dx = targetState.predicted_pos.x - selfState.anchorPos.x;
            let dy = targetState.predicted_pos.y - (selfState.anchorPos.y + 1.5); 
            let dz = targetState.predicted_pos.z - selfState.anchorPos.z;
            const mag = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (mag > 0) perfectDir = { x: dx/mag, y: dy/mag, z: dz/mag };
        }

        if (perfectDir && payload.bullet_events && Array.isArray(payload.bullet_events)) {
            for (let i = 0; i < payload.bullet_events.length; i++) {
                let bullet = payload.bullet_events[i];
                
                // Ghi đè Vector của viên đạn ngay khi nó được sinh ra
                bullet.ray_dir = { ...perfectDir };
                bullet.target_id = targetState.id;
                
                // Tiêm đặc quyền Auto-Wall cấp độ Gói tin đạn (Dự phòng cho Lõi Vật lý)
                if (bullet.collision_obstacle !== undefined) bullet.collision_obstacle = false;
                if (bullet.is_penetrating !== undefined) bullet.is_penetrating = true;
            }
        }

        // ====================================================================
        // 4. CƯỠNG CHẾ XƯƠNG & ĐỒNG BỘ THỜI GIAN (ABSOLUTE BONE SYNC)
        // ====================================================================
        if (payload.damage_report || payload.hit_event) {
            let report = payload.damage_report || payload.hit_event;
            
            report.target_id = targetState.id;
            
            // Ép Hệ thống ghi nhận Headshot (Xương 8)
            report.hit_bone = 8; 
            report.is_headshot = true;
            
            // [ĐỒNG BỘ QUAN TRỌNG - CHỐNG ANTI-CHEAT]:
            // Khớp Tọa độ va chạm vật lý với chuẩn tọa độ não từ M4 (Backtracking).
            // Dù địch đang chạy cách đó 10m trên màn hình, tọa độ đạn đập vào vẫn được
            // khai báo trùng khớp với tọa độ cái bóng trong quá khứ.
            report.hit_pos = {
                x: targetState.predicted_pos.x,
                y: targetState.predicted_pos.y,
                z: targetState.predicted_pos.z
            };

            // Khớp Vector ngắm để Server không phát hiện "Đạn bay từ một hướng, va chạm một hướng"
            if (report.ray_dir && perfectDir) {
                report.ray_dir = { ...perfectDir };
            }

            // Chốt chặn Tối Hậu: Bỏ qua giảm sát thương và Xuyên 100% Giáp
            if (report.distance_penalty !== undefined) report.distance_penalty = 0.0;
            if (report.armor_penetration !== undefined) report.armor_penetration = 1.0;
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
