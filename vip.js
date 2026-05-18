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
        
        target: { id: null, pos: null, predicted_pos: null, distance: 9999.0 },
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
// MODULE 4: TARGET KINEMATICS (LÕI ĐỘNG HỌC MỤC TIÊU - V12.0 DYNAMIC CORE)
// Tích hợp: Động học Tâm Cầu (Dynamic Core Anchoring), Magnetic Inversion, 
// Zero-Ping Hitscan (T = 0.1s Wind-up), và Bộ lọc Feedforward EMA.
// KHẮC PHỤC: Lỗi đạn vọt qua đầu bằng cách khóa chết vào tâm hình học của hitbox.
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
            payload.aim_assist.snap_weight = -9999.0;
        }

        if (!payload || !payload.players || !Array.isArray(payload.players)) return payload;

        const selfState = _global.__OmniState.self;
        if (!selfState.anchorPos || selfState.anchorPos.x === 0) return payload; 

        let bestTarget = null;
        let lowestThreatScore = 999999.0;
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
                    if (enemy.hitboxes.head.snap_weight !== undefined) enemy.hitboxes.head.snap_weight = 9999.0;
                    if (enemy.hitboxes.head.friction !== undefined) enemy.hitboxes.head.friction = 1.0;
                    enemy.hitboxes.head.priority = "HIGHEST"; 
                }

                // BÓP NÁT TỪ TÍNH CỦA NGỰC VÀ CÁC CHI
                const junkParts = ['chest', 'spine', 'pelvis', 'legs', 'arms', 'left_arm', 'right_arm', 'left_leg', 'right_leg'];
                for (let p = 0; p < junkParts.length; p++) {
                    let part = junkParts[p];
                    if (enemy.hitboxes[part]) {
                        if (enemy.hitboxes[part].snap_weight !== undefined) enemy.hitboxes[part].snap_weight = -9999.0;
                        if (enemy.hitboxes[part].friction !== undefined) enemy.hitboxes[part].friction = 0.0;
                        enemy.hitboxes[part].priority = "IGNORE";
                    }
                }
            }

            // --- MA TRẬN ĐÁNH GIÁ MỤC TIÊU ---
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
        // 3. KHÓA TỬ HUYỆT (DYNAMIC CORE ANCHORING) & ZERO-PING HITSCAN
        // ====================================================================
        if (bestTarget) {
            const targetState = _global.__OmniState.target;
            const tracker = _global.__OmniState.tracker;
            const currentTime = Date.now();

            targetState.id = bestTarget.id;
            targetState.distance = bestTarget.distance;
            
            // ĐỘT PHÁ 1: Tính toán Tâm khối cầu Lõi Sọ (Sphere Centroid)
            let baseHead = bestTarget.hitboxes?.head?.pos || { x: bestTarget.pos.x, y: bestTarget.pos.y + 1.5, z: bestTarget.pos.z };
            
            // Trích xuất bán kính thực tế của cái đầu, nếu không có thì mặc định 15cm (0.15m)
            let headRadius = bestTarget.hitboxes?.head?.radius || 0.15; 
            
            // Tịnh tiến tọa độ ngắm vào đúng trọng tâm của khối cầu Lõi Sọ.
            // Bằng cách cộng thêm 1/2 bán kính, tâm súng luôn được bao bọc bởi vùng Hitbox đặc.
            let targetAimPos = {
                x: baseHead.x,
                y: baseHead.y + (headRadius * 0.5), 
                z: baseHead.z
            };

            // EXPORT 1: Thực tại Đồ họa (Tọa độ Head chuẩn)
            targetState.pos = { ...targetAimPos };

            if (!tracker[bestTarget.id]) {
                tracker[bestTarget.id] = { 
                    history: [], 
                    velocity: {x:0, y:0, z:0},
                    lastVelocity: {x:0, y:0, z:0} 
                };
                targetState.predicted_pos = { ...targetAimPos }; 
                targetState.velocity = {x:0, y:0, z:0};
            } 
            else {
                let trackData = tracker[bestTarget.id];
                
                trackData.history.unshift({ pos: { ...targetAimPos }, time: currentTime });
                if (trackData.history.length > 10) trackData.history.pop();

                let prevFrame = trackData.history[1] || trackData.history[0];
                let dt = (currentTime - prevFrame.time) / 1000.0;
                
                if (dt > 0.0 && dt < 0.2) { 
                    // --------------------------------------------------------
                    // A. BỘ LỌC VẬN TỐC MƯỢT (FEEDFORWARD SOURCE)
                    // --------------------------------------------------------
                    let raw_vx = (targetAimPos.x - prevFrame.pos.x) / dt;
                    let raw_vy = (targetAimPos.y - prevFrame.pos.y) / dt;
                    let raw_vz = (targetAimPos.z - prevFrame.pos.z) / dt;

                    let alphaV = 0.5; // Bộ lọc mượt 50%
                    let vx = (raw_vx * alphaV) + (trackData.velocity.x * (1.0 - alphaV));
                    let vy = (raw_vy * alphaV) + (trackData.velocity.y * (1.0 - alphaV));
                    let vz = (raw_vz * alphaV) + (trackData.velocity.z * (1.0 - alphaV));
                    
                    trackData.velocity = { x: vx, y: vy, z: vz };
                    targetState.velocity = { x: vx, y: vy, z: vz };

                    // --------------------------------------------------------
                    // B. GIA TỐC & ZERO-PING HITSCAN (Bảo toàn từ vip 29)
                    // --------------------------------------------------------
                    let ax = 0, ay = 0, az = 0;
                    if (trackData.lastVelocity) {
                        ax = (vx - trackData.lastVelocity.x) / dt;
                        ay = (vy - trackData.lastVelocity.y) / dt;
                        az = (vz - trackData.lastVelocity.z) / dt;
                    }
                    trackData.lastVelocity = { x: vx, y: vy, z: vz };

                    let timeToTarget = 0.10;
                    let accelMagXZ = Math.sqrt(ax*ax + az*az);
                    let strafeDampener = (accelMagXZ > 40.0) ? 0.2 : ((accelMagXZ > 15.0) ? 0.6 : 1.0);

                    // Dự đoán quỹ đạo 0.1s trong tương lai
                    let predX = targetAimPos.x + (vx * timeToTarget) + (0.5 * ax * timeToTarget * timeToTarget * strafeDampener);
                    let predZ = targetAimPos.z + (vz * timeToTarget) + (0.5 * az * timeToTarget * timeToTarget * strafeDampener);
                    let predY = targetAimPos.y + (vy * timeToTarget);

                    // Trừ hao Trọng lực nếu địch nhảy
                    let speed = Math.sqrt(vx*vx + vy*vy + vz*vz);
                    let isJumping = Math.abs(vy) > 1.2 && speed <= 12.0; 
                    if (isJumping) {
                        predY -= 0.5 * 9.81 * (timeToTarget * timeToTarget);
                    }

                    // EXPORT 2: Thực tại Tương lai (Dành cho M8)
                    targetState.predicted_pos = { x: predX, y: predY, z: predZ };
                    
                } else {
                    targetState.predicted_pos = { ...targetAimPos };
                    targetState.velocity = {x:0, y:0, z:0};
                }
            }
        } else {
            _global.__OmniState.target = { id: null, pos: null, predicted_pos: null, distance: 9999.0, velocity: {x:0, y:0, z:0} };
        }

        return payload;
    }
}

// ============================================================================
// MODULE 7: CAMERA MANIPULATOR (LÕI ĐIỀU HƯỚNG - V12.0 SPATIAL DEADBOX)
// Tích hợp: Hộp Khóa Không Gian (Spatial Deadbox Snap), Tiền Triệt Tiêu Nảy Nòng
// (Pre-emptive Recoil Subtraction), và Feedforward Smooth Tracking.
// KHẮC PHỤC: Lỗi trượt tâm và rung lắc do Game Engine giằng co.
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

        // Bỏ qua nếu mất mục tiêu
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
            
        // Đích đến lúc này là Tâm Cầu Lõi Sọ (Được M4 V12.0 tinh chỉnh chuẩn xác)
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
        // 1. TIỀN TRIỆT TIÊU NẢY NÒNG VÀ TOÁN HỌC KHÔNG GIAN
        // ====================================================================
        let feedforwardYawStep = 0;
        let feedforwardPitchStep = 0;

        // Tính toán Vận tốc Góc để bám theo kẻ địch di chuyển (Feedforward)
        if (targetState.velocity) {
            let futureX = dest.x + (targetState.velocity.x * 0.001);
            let futureY = dest.y + (targetState.velocity.y * 0.001);
            let futureZ = dest.z + (targetState.velocity.z * 0.001);
            
            let futureDx = futureX - origin.x;
            let futureDy = futureY - origin.y;
            let futureDz = futureZ - origin.z;
            let futureDistXZ = Math.sqrt(futureDx*futureDx + futureDz*futureDz);

            let futureYaw = this.normalizeAngle(Math.atan2(futureDx, futureDz) * (180.0 / Math.PI));
            let futurePitch = this.normalizeAngle(Math.atan2(-futureDy, futureDistXZ) * (180.0 / Math.PI));

            feedforwardYawStep = (this.normalizeAngle(futureYaw - trueYaw) / 0.001) * dt;
            feedforwardPitchStep = (this.normalizeAngle(futurePitch - truePitch) / 0.001) * dt;
        }

        // Bắt lấy xung lực nảy màn hình nội bộ (Recoil Kick)
        let internalRecoilPitch = 0.0;
        let internalRecoilYaw = 0.0;
        if (payload.weapon) {
            internalRecoilPitch = payload.weapon.recoil_y || payload.weapon.dynamic_recoil_pitch || 0.0;
            internalRecoilYaw = payload.weapon.recoil_x || payload.weapon.dynamic_recoil_yaw || 0.0;
        }

        // ĐỘT PHÁ 2: Tính toán Bán kính Hộp khóa (Spatial Deadbox)
        // Kẻ địch càng gần, hitbox càng to trên màn hình -> Góc SweetSpot càng lớn.
        // Giả sử bán kính đầu là 0.15m.
        let headRadius = 0.15;
        let fovSweetSpot = Math.atan2(headRadius, distXZ) * (180.0 / Math.PI);
        fovSweetSpot = Math.max(0.6, fovSweetSpot); // Không bao giờ siết nhỏ hơn 0.6 độ để tránh trượt

        // ====================================================================
        // 2. GIAO THỨC ĐIỀU HƯỚNG BẠO LỰC (SPATIAL DEADBOX SNAP)
        // ====================================================================
        if (isFiring) {
            let isInsideDeadbox = Math.abs(errorYaw) <= fovSweetSpot && Math.abs(errorPitch) <= fovSweetSpot;

            if (isInsideDeadbox) {
                // TRẠNG THÁI KHÓA TỬ HUYỆT (Đóng băng mọi sai số)
                // Ép Camera Teleport đúng vào lượng sai số hiện tại, CỘNG THÊM vận tốc chạy của địch
                // Và TRỪ ĐI lực giật nảy màn hình. Kết quả: Tâm đứng im phăng phắc giữa trán.
                outputYawStep = errorYaw + feedforwardYawStep - internalRecoilYaw;
                outputPitchStep = errorPitch + feedforwardPitchStep - internalRecoilPitch;
                
                camState.integralYaw = 0;
                camState.integralPitch = 0;
                disableEMA = true; // Tắt làm mượt để lực ép đạt tốc độ 0ms
            } else {
                // CHƯA LỌT VÀO HỘP KHÓA (Đang Snapaim tốc độ cao)
                let Kp_snap = 65.0; // Gia tốc siêu cao để kéo tâm nhanh vào hộp khóa
                outputYawStep = (errorYaw * Kp_snap * dt) + feedforwardYawStep;
                outputPitchStep = (errorPitch * Kp_snap * dt) + feedforwardPitchStep;

                // Cắt đuôi quán tính vẩy tâm (Phanh lượng tử góc nhìn)
                if (Math.abs(outputYawStep) > Math.abs(errorYaw)) outputYawStep = errorYaw;
                if (Math.abs(outputPitchStep) > Math.abs(errorPitch)) outputPitchStep = errorPitch;

                camState.integralYaw = 0;
                camState.integralPitch = 0;
                disableEMA = true;
            }
        } 
        // ====================================================================
        // 3. RÀ TÂM MƯỢT MÀ (BẬT SCOPE NHƯNG CHƯA BÓP CÒ)
        // ====================================================================
        else {
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

            outputYawStep = (pidYaw * dt) + feedforwardYawStep;
            outputPitchStep = (pidPitch * dt) + feedforwardPitchStep;
            
            if (Math.abs(outputPitchStep) > Math.abs(errorPitch)) outputPitchStep = errorPitch;
        }

        camState.prevErrorYaw = errorYaw;
        camState.prevErrorPitch = errorPitch;

        // ====================================================================
        // 4. KÍNH LỌC EMA TẦN SỐ CAO
        // ====================================================================
        if (camState.emaYaw === undefined) camState.emaYaw = currentYaw;
        if (camState.emaPitch === undefined) camState.emaPitch = currentPitch;

        let rawNewYaw = currentYaw + outputYawStep;
        let rawNewPitch = currentPitch + outputPitchStep;

        // Chỉ làm mượt khi chưa bóp cò. Đã bóp cò là ưu tiên tốc độ tuyệt đối.
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
// MODULE 5: SELF KINEMATICS (LÕI ĐỘNG HỌC BẢN THÂN - V8.0 MICRO-BRAKING)
// Tích hợp: 1-Tick Stance Spoofing (Phanh Lượng Tử), Chronos Anchor 
// (Neo Thời Không T-1), và CQC Origin Spoofing (Dịch chuyển nòng súng).
// ============================================================================
class SelfKinematics {
    static processSelfState(payload) {
        const state = _global.__OmniState.self;
        const targetState = _global.__OmniState.target;
        const weaponState = _global.__OmniState.weapon;
        
        // Nhận diện trạng thái bóp cò
        const isFiring = weaponState.isFiring || weaponState.triggerFired || payload.is_firing;

        // Khởi tạo bộ nhớ Lịch sử Không gian (Tracking History)
        if (!state.history) state.history = [];
        if (!state.lastAnchor) state.lastAnchor = null;

        // ====================================================================
        // TRẠNG THÁI NGHỈ: LIÊN TỤC CẬP NHẬT TỌA ĐỘ (CHỐNG GIẬT LAG)
        // ====================================================================
        // KHÔNG BAO GIỜ can thiệp vào pos khi đang di chuyển bình thường.
        // Điều này đảm bảo Server Reconciliation không giật lùi nhân vật.
        if (payload.pos !== undefined) {
            state.history.unshift({ ...payload.pos });
            if (state.history.length > 5) state.history.pop(); 
        }

        if (!isFiring) {
            // Liên tục lưu Anchor (Điểm neo súng) của frame hiện tại
            if (payload.anchorPos !== undefined) {
                state.lastAnchor = { ...payload.anchorPos };
            }
            return payload; 
        }

        // ====================================================================
        // TRẠNG THÁI KHAI HỎA: KÍCH HOẠT ĐIỂM KỲ DỊ (SINGULARITY)
        // ====================================================================
        
        // 1. CHRONOS ANCHOR (NEO THỜI KHÔNG T-1)
        // Khóa 'anchorPos' (Bệ phóng đạn) về tọa độ tĩnh lặng của mili-giây trước đó.
        if (payload.anchorPos !== undefined && state.lastAnchor) {
            payload.anchorPos.x = state.lastAnchor.x;
            payload.anchorPos.y = state.lastAnchor.y;
            payload.anchorPos.z = state.lastAnchor.z;
        }

        // 2. CQC ORIGIN SPOOFING (DỊCH CHUYỂN NÒNG SÚNG CẬN CHIẾN)
        if (payload.fire_origin !== undefined) {
            if (targetState.id && targetState.distance < 3.0 && targetState.predicted_pos) {
                // Dịch chuyển điểm sinh đạn vào thẳng Lõi Sọ kẻ thù!
                payload.fire_origin = {
                    x: targetState.predicted_pos.x,
                    y: targetState.predicted_pos.y,
                    z: targetState.predicted_pos.z - 0.1 
                };
            } 
            else if (state.lastAnchor) {
                payload.fire_origin = {
                    x: state.lastAnchor.x,
                    y: state.lastAnchor.y + 1.5, 
                    z: state.lastAnchor.z
                };
            }
        }

        // 3. ANCHOR ROOTING (ĐÓNG BĂNG RỄ SINH HỌC)
        if (payload.body_sway !== undefined) payload.body_sway = 0.0;
        
        // ====================================================================
        // 4. MICRO-BRAKING (PHANH LƯỢNG TỬ 1-TICK) - [BẢN VÁ TỐI THƯỢNG]
        // ====================================================================
        // Thay vì đóng băng vận tốc liên tục gây lỗi giật lùi, chúng ta CHỈ tước đoạt 
        // vận tốc ở ĐÚNG KHUNG HÌNH DUY NHẤT mà viên đạn đầu tiên thoát nòng (triggerFired = true).
        // Máy chủ sẽ ghi nhận pha nổ súng này diễn ra trong trạng thái "Đứng im tuyệt đối".
        if (weaponState.triggerFired) {
            // Xóa sổ gia tốc và vận tốc di chuyển
            if (payload.velocity !== undefined) {
                payload.velocity = { x: 0.0, y: 0.0, z: 0.0 };
            }
            if (payload.acceleration !== undefined) {
                payload.acceleration = { x: 0.0, y: 0.0, z: 0.0 };
            }
            
            // Giả mạo trạng thái tĩnh lặng
            if (payload.speed !== undefined) payload.speed = 0.0;
            if (payload.is_moving !== undefined) payload.is_moving = false;
        }
        // Ở các khung hình tiếp theo (khi đè nút sấy đạn), triggerFired sẽ = false.
        // Game Engine sẽ tự động bỏ qua khối lệnh trên, trả lại vận tốc thật cho gói tin.
        // Nhân vật của bạn tiếp tục lướt đi trên màn hình mà không hề bị khựng lại!

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
// MODULE 8: MAGIC BULLET CORE (LÕI ĐẠN MA THUẬT - V12.0 ABSOLUTE DECOUPLING)
// Tích hợp: Phân lập Động lượng Toàn phần (Dual Inertia Decoupling), 
// Zero-Ping Centroid Raycast, Tụ đạn Shotgun, và Smart Anti-Overlap.
// ĐỒNG BỘ: Hoạt động khớp 100% với Lõi Tâm Cầu (M4) và Hộp Khóa (M7).
// ============================================================================
class MagicBulletCore {
    static execute(payload) {
        const targetState = _global.__OmniState.target;
        const selfState = _global.__OmniState.self;

        // Bỏ qua nếu M4 chưa cung cấp tọa độ của Tâm cầu Lõi Sọ tương lai (0.1s)
        if (!targetState || !targetState.id || !targetState.predicted_pos) return payload;

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
        // 3. CENTROID VECTORING (TÍNH TOÁN ĐƯỜNG ĐẠN LÕI)
        // ====================================================================
        let perfectDir = null;
        let origin = payload.fire_origin || selfState.lastAnchor || selfState.anchorPos;
        
        if (origin && targetState.predicted_pos) {
            // Đích đến không còn là đỉnh chóp ngây ngô nữa, mà là Tâm khối cầu 
            // Lõi Sọ đã được M4 tính toán bù trừ độ rơi 0.1s.
            let dest = { ...targetState.predicted_pos }; 
            
            let dx = dest.x - origin.x;
            let dy = dest.y - (payload.fire_origin ? origin.y : origin.y + 1.5); 
            let dz = dest.z - origin.z;
            
            const mag = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (mag > 0) perfectDir = { x: dx/mag, y: dy/mag, z: dz/mag };
        }

        // ====================================================================
        // 4. ABSOLUTE DECOUPLING (PHÂN LẬP ĐỘNG LƯỢNG KÉP)
        // ====================================================================
        if (perfectDir && payload.bullet_events && Array.isArray(payload.bullet_events)) {
            for (let i = 0; i < payload.bullet_events.length; i++) {
                let bullet = payload.bullet_events[i];
                
                // Gán Vector Lượng giác Tâm Cầu
                bullet.ray_dir = { ...perfectDir };
                bullet.target_id = targetState.id;
                
                // Triệt tiêu sai số ngẫu nhiên của vũ khí
                if (bullet.spread_angle !== undefined) bullet.spread_angle = 0.0;
                if (bullet.deviation !== undefined) bullet.deviation = 0.0;

                // [BẢN VÁ V12.0]: BỨC TỬ QUÁN TÍNH ENGINE TẬN GỐC
                // Game C++ thường nội suy độ cong đạn đạo dựa vào vận tốc người bắn.
                // Ta chèn mã ép toàn bộ các lực này về KHÔNG tuyệt đối.
                if (bullet.angular_velocity !== undefined) bullet.angular_velocity = 0.0;
                if (bullet.momentum_offset !== undefined) bullet.momentum_offset = 0.0;
                if (bullet.drift !== undefined) bullet.drift = 0.0;
                if (bullet.trajectory_curve !== undefined) bullet.trajectory_curve = 0.0;
                
                // ĐỘT PHÁ: Chặn đứng sự Kế thừa Vận tốc từ Tatsuya / Sprint
                if (bullet.velocity_inheritance !== undefined) bullet.velocity_inheritance = 0.0;
                if (bullet.shooter_velocity !== undefined) bullet.shooter_velocity = { x: 0.0, y: 0.0, z: 0.0 };
                if (bullet.shooter_acceleration !== undefined) bullet.shooter_acceleration = { x: 0.0, y: 0.0, z: 0.0 };
                if (bullet.initial_velocity_multiplier !== undefined) bullet.initial_velocity_multiplier = 0.0;
                
                // [LƯU Ý]: Giữ nguyên tính toàn vẹn vật lý của vật cản (Không Ghost Bullet)
                // Đảm bảo không bị Red Flag từ Server.
            }
        }

        // ====================================================================
        // 5. DAMAGE FINALIZATION (CHỐT HẠ SÁT THƯƠNG TÂM CẦU)
        // ====================================================================
        if (payload.damage_report || payload.hit_event) {
            let report = payload.damage_report || payload.hit_event;
            
            report.target_id = targetState.id;
            report.hit_bone = 8; // Xác nhận Lõi Sọ
            report.is_headshot = true;
            
            // Ép Tọa độ va chạm vật lý (hit_pos) chui tọt vào giữa Tâm Cầu tương lai
            report.hit_pos = { ...targetState.predicted_pos };
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
