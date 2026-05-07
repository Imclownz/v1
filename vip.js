/**
 * ==============================================================================
 * PROJECT: OMNI-MATRIX V2 (THE APEX ARCHITECTURE)
 * Pipeline: Sync -> M1 (Profile) -> M5 (Self) -> M4 (Target) -> M2/M3/M6 (Execution)
 * Status: Foundation Ready. Awaiting Module Integration.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);

// ============================================================================
// 0. GLOBAL STATE (BỘ NHỚ DÙNG CHUNG ĐỒNG BỘ TỔNG)
// ============================================================================
if (!_global.__OmniState || _global.__OmniState.version !== "MATRIX_V2") {
    _global.__OmniState = {
        version: "MATRIX_V2",
        currentPing: 50.0,
        weaponProfile: null, // Lưu trữ Hồ sơ Vũ khí Động từ Module 1
        
        target: { id: null, pos: null, predicted_pos: null, distance: 9999.0 },
        self: { pos: {x:0, y:0, z:0}, anchorPos: {x:0, y:0, z:0}, vel: {x:0, y:0, z:0}, isPerfectlyStill: false },
        weapon: { isFiring: false, id: "", category: "" },
        
        tracker: {} // Bộ đệm Lịch sử cho Module 4
    };
}

// ============================================================================
// MODULE 1: WEAPON CLASSIFIER (HỆ THỐNG CẤP PHÁT HỒ SƠ KHÍ TÀI)
// ============================================================================
class WeaponClassifier {
    static getProfile(weaponData) {
        // Hồ sơ mặc định (Bỏ qua can thiệp)
        const defaultProfile = { 
            Core: "IGNORE", 
            RequireZeroVelocity: false, 
            AllowTriggerBot: false, 
            MaxEngagementRange: 0.0, 
            RecoilCompression: 1.0 
        };
        
        if (!weaponData) return defaultProfile;

        const id = (weaponData.id || "").toUpperCase();
        const category = (weaponData.category || "").toUpperCase();

        // 1. NHÓM BỎ QUA (Sniper, Vũ khí cận chiến)
        const ignoredWeapons = ["AWM", "KAR98K", "M82B", "TREATMENT", "CROSSBOW"];
        if (category === "SNIPER" || category === "MELEE" || ignoredWeapons.includes(id)) {
            return defaultProfile;
        }

        // 2. NHÓM ONE-TAP (Module 6)
        const oneTapIDs = ["DESERT EAGLE", "WOODPECKER", "SVD", "AC80", "SKS", "M590"];
        if (oneTapIDs.includes(id) || category === "MARKSMAN_RIFLE") {
            return {
                Core: "ONETAP",
                RequireZeroVelocity: true,  // BẮT BUỘC Module 5 phải phanh ảo thành công
                AllowTriggerBot: true,      // Kích hoạt Raycast tự động nhả đạn
                MaxEngagementRange: 150.0,  // Tầm xa tối đa
                RecoilCompression: 0.0      // Không quan tâm độ giật vì chỉ bắn 1 viên
            };
        }

        // 3. NHÓM SHOTGUN (Module 2)
        const shotgunIDs = ["M1887", "M1014", "SPAS12", "MAG7", "CHARGE", "TROS"];
        if (category === "SHOTGUN" || shotgunIDs.includes(id)) {
            return {
                Core: "SHOTGUN",
                RequireZeroVelocity: false, // Cho phép nhảy bắn tự do
                AllowTriggerBot: true,      // Cho phép tự động nổ súng khi nhét nòng vào sọ
                MaxEngagementRange: 15.0,   // Chỉ thao túng khi địch ở cự ly dưới 15m
                RecoilCompression: 0.0
            };
        }

        // 4. NHÓM TỰ ĐỘNG SMG/AR (Module 3)
        const autoCategories = ["SMG", "AR", "LMG", "MACHINEGUN"];
        if (autoCategories.includes(category) || weaponData.is_automatic) {
            return {
                Core: "AUTO",
                RequireZeroVelocity: false, // Vừa chạy vừa sấy vô tư
                AllowTriggerBot: false,     // Tắt Triggerbot để tránh xả đạn lãng phí
                MaxEngagementRange: 100.0,
                RecoilCompression: 0.05     // Lệnh cho Module 3 nén 95% độ giật trên Server
            };
        }

        // Fallback cho các súng chưa nhận diện được
        return { ...defaultProfile, Core: "AUTO", RecoilCompression: 0.05, MaxEngagementRange: 80.0 };
    }
}

// ============================================================================
// CHỖ TRỐNG MODULE (CHỜ LẮP RÁP)
// ============================================================================

// ============================================================================
// MODULE 5: SELF-KINEMATICS (LÕI THANH TẨY QUÁN TÍNH BẢN THÂN)
// Nhiệm vụ: Tính toán Động năng, Phanh Vi Mô Ảo, Chống kẹt tường và Bù trừ góc ngắm.
// ============================================================================
class SelfKinematics {
    static processSelfState(payload) {
        
        // 1. CẬP NHẬT ĐỘNG NĂNG THỰC TẾ CỦA NGƯỜI CHƠI
        if (payload.player_pos) {
            const prevPos = _global.__OmniState.self.anchorPos;
            const currPos = payload.player_pos;
            
            if (prevPos && currPos) {
                const dt = 0.016; // Giả định Tickrate game là 60Hz (~16ms mỗi gói tin)
                _global.__OmniState.self.vel = {
                    x: (currPos.x - prevPos.x) / dt,
                    y: (currPos.y - prevPos.y) / dt,
                    z: (currPos.z - prevPos.z) / dt
                };
            }
        }

        const vel = _global.__OmniState.self.vel;
        const speedXZ = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
        const profile = _global.__OmniState.weaponProfile;

        // Cấp chứng nhận Động năng Tĩnh (Dành cho Module 6 One-Tap đánh giá Rủi ro)
        // Nếu tốc độ < 0.5m/s (gần như đứng im), coi như an toàn để bắn
        _global.__OmniState.self.isPerfectlyStill = (speedXZ < 0.5);

        // 2. ZERO-VELOCITY SPOOFING (PHANH VI MÔ ẢO DỰA TRÊN HỒ SƠ VŨ KHÍ)
        // Chỉ kích hoạt khi đang bắn VÀ súng yêu cầu động năng = 0 (Ví dụ: Desert Eagle)
        if (_global.__OmniState.weapon.isFiring && profile && profile.RequireZeroVelocity) {
            
            // Đóng băng mọi trạng thái di chuyển trên Server
            if (payload.player_velocity !== undefined) {
                payload.player_velocity = { x: 0.0, y: 0.0, z: 0.0 };
            }
            if (payload.is_moving !== undefined) payload.is_moving = false;
            if (payload.is_sprinting !== undefined) payload.is_sprinting = false;
            if (payload.is_jumping !== undefined) payload.is_jumping = false;
            if (payload.in_air !== undefined) payload.in_air = false;
            if (payload.stance !== undefined) payload.stance = "STANDING";
            if (payload.pose_id !== undefined) payload.pose_id = "STANDING";
            
            // Ép hệ thống nội bộ tin rằng trạng thái đã an toàn tuyệt đối 100%
            _global.__OmniState.self.isPerfectlyStill = true; 
        }

        // 3. PING-COMPENSATED ORIGIN SHIFT (NỘI SUY ĐIỂM BẮN CHỐNG KẸT TƯỜNG)
        if ((payload.fire_event || payload.damage_report || payload.weapon?.is_firing) && payload.fire_origin !== undefined) {
            const pingDelay = _global.__OmniState.currentPing / 1000.0;
            
            // Nếu đang chạy nhanh lách ra khỏi tường, đẩy nòng súng đi trước 1 nhịp Ping
            if (speedXZ > 1.0) {
                payload.fire_origin.x += (vel.x * pingDelay);
                payload.fire_origin.z += (vel.z * pingDelay);
            }
            
            // Cưỡng chế nòng súng ở cao độ chuẩn để không bị bắn kẹt dưới đất khi nhảy/lộn nhào
            const standardEyeLevel = _global.__OmniState.self.pos.y + 1.5;
            if (payload.fire_origin.y < standardEyeLevel) {
                payload.fire_origin.y = standardEyeLevel;
            }
        }

        // 4. VECTOR COUNTER-STRAFE (TOÁN HỌC BÙ TRỪ QUÁN TÍNH ĐẠN ĐẠO)
        // Khi không dùng Phanh Ảo (như lúc sấy SMG), đạn sẽ bị lệch theo quán tính chạy.
        if ((payload.fire_event || payload.damage_report) && payload.aim_yaw !== undefined) {
            
            // Chỉ kích hoạt nếu chạy nhanh VÀ không bị ép Zero-Velocity
            if (speedXZ > 2.0 && (!profile || !profile.RequireZeroVelocity)) {
                
                const moveYaw = Math.atan2(vel.x, vel.z) * (180.0 / Math.PI);
                
                let deltaYaw = moveYaw - payload.aim_yaw;
                if (deltaYaw > 180) deltaYaw -= 360;
                if (deltaYaw < -180) deltaYaw += 360;
                
                // Nghịch đảo góc ngắm: bẻ Vector ngược lại với hướng đang chạy
                const inertiaCompensation = deltaYaw * 0.08; // 0.08 là ma sát không khí giả lập
                payload.aim_yaw -= inertiaCompensation;
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 4: TARGET KINEMATICS (LÕI THEO DÕI VÀ DỰ ĐOÁN MỤC TIÊU ĐỘNG)
// Nhiệm vụ: Bình chuẩn hóa Tư thế, Inverse Kinematics, Ngoại suy Bậc 2 & Strafe.
// ============================================================================
class TargetKinematics {
    
    // Đảo ngược Khung xương: Tìm Trọng tâm Đầu ảo (Triệt tiêu rung lắc do Animation)
    static getTrueHeadCenter(enemy) {
        if (enemy.hitboxes && enemy.hitboxes.spine && enemy.hitboxes.pelvis) {
            const spine = enemy.hitboxes.spine;
            const pelvis = enemy.hitboxes.pelvis;
            
            const dx = spine.x - pelvis.x;
            const dy = spine.y - pelvis.y;
            const dz = spine.z - pelvis.z;
            
            const heightFactor = 1.65; // Đẩy tọa độ từ Chậu qua Cột sống lên thẳng Lõi sọ
            return {
                x: pelvis.x + dx * heightFactor,
                y: pelvis.y + dy * heightFactor,
                z: pelvis.z + dz * heightFactor
            };
        }
        if (enemy.head_pos) return { ...enemy.head_pos };
        return { ...enemy.pos };
    }

    static processTargetState(payload) {
        if (payload.players && Array.isArray(payload.players)) {
            let bestTarget = null;
            let minDistance = 9999.0;
            const currentTime = Date.now();

            // 1. QUÉT MỤC TIÊU VÀ BÌNH CHUẨN HÓA (STANCE NULLIFICATION)
            for (let i = 0; i < payload.players.length; i++) {
                const enemy = payload.players[i];

                // Ép mọi kẻ địch về trạng thái đứng thẳng tĩnh lặng (Chống ảo dame do nhảy/lướt/nằm)
                if (enemy.stance !== undefined) enemy.stance = "STANDING";
                if (enemy.pose_id !== undefined) enemy.pose_id = "STANDING";
                if (enemy.is_jumping !== undefined) enemy.is_jumping = false;
                if (enemy.in_air !== undefined) enemy.in_air = false;

                if (enemy.is_visible !== false && enemy.occluded !== true) {
                    if (enemy.distance < minDistance) {
                        minDistance = enemy.distance;
                        bestTarget = enemy;
                    }
                }
            }

            // 2. KHÓA TỌA ĐỘ VÀ NỘI SUY TƯƠNG LAI
            if (bestTarget && bestTarget.head_pos) {
                const targetId = bestTarget.id;
                _global.__OmniState.target.id = targetId;
                _global.__OmniState.target.distance = minDistance;
                
                // Lấy Trọng tâm Đầu Ảo (Tọa độ Tĩnh)
                const currentTrueHead = this.getTrueHeadCenter(bestTarget);
                _global.__OmniState.target.pos = { ...currentTrueHead };

                // Khởi tạo Bộ đệm Lịch sử cho mục tiêu này
                if (!_global.__OmniState.tracker[targetId]) {
                    _global.__OmniState.tracker[targetId] = { history: [], lastStrafeTime: 0 };
                }
                
                const state = _global.__OmniState.tracker[targetId];
                state.history.push({ pos: currentTrueHead, time: currentTime });
                if (state.history.length > 5) state.history.shift(); // Chỉ giữ 5 khung hình gần nhất

                let predictedPos = { ...currentTrueHead };

                // Yêu cầu tối thiểu 3 khung hình để tính Gia Tốc
                if (state.history.length >= 3) {
                    const p0 = state.history[state.history.length - 3];
                    const p1 = state.history[state.history.length - 2];
                    const p2 = state.history[state.history.length - 1];

                    const dt1 = (p1.time - p0.time) / 1000.0 || 0.016;
                    const dt2 = (p2.time - p1.time) / 1000.0 || 0.016;

                    // Tính Vận tốc (V1, V2) và Gia tốc (A)
                    const v1 = { x: (p1.pos.x - p0.pos.x)/dt1, y: (p1.pos.y - p0.pos.y)/dt1, z: (p1.pos.z - p0.pos.z)/dt1 };
                    const v2 = { x: (p2.pos.x - p1.pos.x)/dt2, y: (p2.pos.y - p1.pos.y)/dt2, z: (p2.pos.z - p1.pos.z)/dt2 };
                    const a  = { x: (v2.x - v1.x)/dt2, y: (v2.y - v1.y)/dt2, z: (v2.z - v1.z)/dt2 };

                    let velWeight = 1.0;
                    let accelWeight = 0.5; 

                    // 3. INTENT HEURISTICS (Nhận diện Đảo hướng - Lách né đạn)
                    const isStrafing = (v1.x > 0 && v2.x < 0) || (v1.x < 0 && v2.x > 0) || (v1.z > 0 && v2.z < 0) || (v1.z < 0 && v2.z > 0);
                    if (isStrafing) {
                        const strafeInterval = currentTime - state.lastStrafeTime;
                        state.lastStrafeTime = currentTime;
                        // Nếu địch lách qua lại siêu gắt (<400ms), kích hoạt Deadzone (Hạ vận tốc dự đoán)
                        if (strafeInterval < 400) {
                            velWeight = 0.1; 
                            accelWeight = 0.0;
                        }
                    }

                    // 4. KIẾN TẠO KHÔNG GIAN TƯƠNG LAI
                    const profile = _global.__OmniState.weaponProfile;
                    // Chỉ tính toán Tương lai nếu mục tiêu nằm trong tầm bắn hiệu quả của súng
                    if (profile && minDistance <= profile.MaxEngagementRange) {
                        // DeltaTime = Ping + 150ms trễ phản hồi mạng nội tại
                        const targetDeltaTime = (_global.__OmniState.currentPing / 1000.0) + 0.150; 
                        
                        predictedPos = {
                            x: currentTrueHead.x + (v2.x * targetDeltaTime * velWeight) + (accelWeight * a.x * Math.pow(targetDeltaTime, 2)),
                            y: currentTrueHead.y + (v2.y * targetDeltaTime * velWeight) + (accelWeight * a.y * Math.pow(targetDeltaTime, 2)),
                            z: currentTrueHead.z + (v2.z * targetDeltaTime * velWeight) + (accelWeight * a.z * Math.pow(targetDeltaTime, 2))
                        };
                    }
                }
                
                // Xuất điểm rơi Tương lai Tuyệt đối vào Bộ nhớ dùng chung
                _global.__OmniState.target.predicted_pos = predictedPos;
            }
        }
        return payload;
    }
}

// ============================================================================
// MODULE 2: SHOTGUN CORE (KẺ XÓA SỔ CẬN CHIẾN)
// Nhiệm vụ: Capsule Nullification (Xóa lực hút thân dưới) & Point-Blank Convergence.
// ============================================================================
class ShotgunCore {
    static execute(payload) {
        
        // 1. CAPSULE NULLIFICATION & MAGNETISM OVERRIDE (Thao túng Hình học)
        if (payload.players && Array.isArray(payload.players)) {
            for (let i = 0; i < payload.players.length; i++) {
                const enemy = payload.players[i];
                
                if (enemy.hitboxes) {
                    // THU NHỎ TOÀN BỘ THÂN DƯỚI VÀ XÓA LỰC HÚT
                    // Biến toàn bộ vùng từ Cổ trở xuống thành một sợi chỉ không có ma sát
                    const lowerBodyParts = ['chest', 'spine', 'pelvis', 'left_arm', 'right_arm', 'left_leg', 'right_leg', 'neck'];
                    lowerBodyParts.forEach(part => {
                        if (enemy.hitboxes[part]) {
                            enemy.hitboxes[part].priority = "IGNORE";
                            enemy.hitboxes[part].friction = 0.0;
                            enemy.hitboxes[part].magnetism = 0.0;
                            enemy.hitboxes[part].snap_weight = -9999.0;
                            // Bóp nghẹt bán kính nhận diện của thân dưới về mức tiệm cận 0
                            enemy.hitboxes[part].radius = 0.001; 
                        }
                    });

                    // PHÓNG TO LÕI SỌ VÀ ÉP TỪ TÍNH CỰC ĐẠI
                    if (enemy.hitboxes['head']) {
                        enemy.hitboxes['head'].priority = "ABSOLUTE";
                        enemy.hitboxes['head'].magnetism = 9999.0;
                        enemy.hitboxes['head'].friction = 9999.0;
                        enemy.hitboxes['head'].snap_weight = 9999.0;
                        // Phóng to kích thước Đầu ảo để nó trở thành hố đen duy nhất
                        enemy.hitboxes['head'].radius = 30.0; 
                    }
                }
            }
        }

        // 2. POINT-BLANK CONVERGENCE & OMNI-AVATAR (Hội tụ hạt đạn Cận chiến)
        // Khi người chơi bóp cò, áp dụng thuật toán gom chùm đạn
        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            const targetState = _global.__OmniState.target;
            
            // Lấy tọa độ mục tiêu tĩnh từ Module 4 (Không dùng predicted_pos vì cận chiến không cần bắn tương lai)
            if (targetState.id && targetState.pos && _global.__OmniState.weapon.isFiring) {
                
                // Cưỡng chế Sát thương Đầu tối đa
                payload.target_id = targetState.id;
                payload.hit_bone = 8;
                payload.is_headshot = true;
                if (payload.ignore_armor !== undefined) payload.ignore_armor = true;

                // DỊCH CHUYỂN NÒNG SÚNG (POINT-BLANK)
                // Đặt nòng súng vào sâu 1cm bên trong sọ địch -> Khoảng cách bay đạn = 0
                // Toàn bộ hạt đạn (Pellets) của Shotgun sẽ nổ tung tại một điểm duy nhất
                if (payload.fire_origin !== undefined) {
                    payload.fire_origin.x = targetState.pos.x;
                    payload.fire_origin.y = targetState.pos.y;
                    payload.fire_origin.z = targetState.pos.z - 0.01; 
                }

                // OMNI-AVATAR SPOOFING (Dịch chuyển bản thể giả mạo)
                // Lừa Server rằng "Tôi đang đứng sát rạt nó để bóp cò, góc bắn này hoàn toàn hợp lệ"
                if (payload.attacker_pos !== undefined) {
                    payload.attacker_pos.x = targetState.pos.x;
                    payload.attacker_pos.y = targetState.pos.y;
                    payload.attacker_pos.z = targetState.pos.z - 0.02;
                }

                // Đồng bộ điểm va chạm
                if (payload.hit_pos !== undefined) {
                    payload.hit_pos = { ...targetState.pos };
                }

                // Gỡ bỏ giới hạn Camera (Trả lại quyền điều khiển mượt mà cho Client)
                if (payload.camera_state) {
                    delete payload.camera_state.target_x;
                    delete payload.camera_state.target_y;
                    delete payload.camera_state.target_z;
                    delete payload.camera_state.interpolation;
                }
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 3: AUTO CORE (MA TRẬN BÁM DÍNH LIÊN THANH)
// Nhiệm vụ: Dynamic Magnetism, Recoil Escalation, Dual-Vector pSilent & Backtrack
// ============================================================================
class AutoCore {
    static execute(payload) {
        
        // 1. INVERSE DISTANCE MAPPING & DUAL-VECTOR VISUALS (Xử lý phần Nhìn)
        if (payload.players && Array.isArray(payload.players)) {
            for (let i = 0; i < payload.players.length; i++) {
                const enemy = payload.players[i];
                
                if (enemy.hitboxes) {
                    const dist = Math.max(1.0, enemy.distance || 10.0); // Chống lỗi chia 0
                    
                    // Toán học Tỉ lệ nghịch: Càng gần bán kính càng to, càng xa càng thu nhỏ lại
                    // Ở 1m: Radius ~ 30.0 (Bao trùm toàn màn hình) | Ở 15m: Radius ~ 2.0 (Vừa bằng Hitbox)
                    const dynamicRadius = Math.max(2.0, Math.min(30.0, 30.0 / (dist * 0.5)));
                    const dynamicFriction = Math.max(100.0, 9999.0 / dist); // Lực kéo cũng giảm dần theo khoảng cách

                    // DỌN DẸP LỰC CẢN THÂN DƯỚI (Chống kẹt tâm cận chiến)
                    const lowerParts = ['pelvis', 'left_leg', 'right_leg', 'left_arm', 'right_arm'];
                    lowerParts.forEach(part => {
                        if (enemy.hitboxes[part]) {
                            enemy.hitboxes[part].priority = "IGNORE";
                            enemy.hitboxes[part].magnetism = 0.0;
                            enemy.hitboxes[part].friction = 0.0;
                            enemy.hitboxes[part].radius = 0.001;
                        }
                    });

                    // VISUAL LOCK: Khóa Camera vào Cổ và Ngực trên thay vì Đầu (Chống văng tâm ở cự ly xa)
                    const anchorParts = ['chest', 'spine', 'neck'];
                    anchorParts.forEach(part => {
                        if (enemy.hitboxes[part]) {
                            enemy.hitboxes[part].priority = "HIGH";
                            enemy.hitboxes[part].magnetism = dynamicFriction;
                            enemy.hitboxes[part].friction = dynamicFriction;
                            enemy.hitboxes[part].snap_weight = dynamicFriction;
                            enemy.hitboxes[part].radius = dynamicRadius;
                        }
                    });

                    // Trả lại Đầu về trạng thái tự nhiên để Aim-Assist không cố giật màn hình lên Đầu
                    if (enemy.hitboxes['head']) {
                        enemy.hitboxes['head'].priority = "NORMAL";
                        enemy.hitboxes['head'].magnetism = 1.0;
                        enemy.hitboxes['head'].radius = 1.0; 
                    }
                }
            }
        }

        // 2. RECOIL COMPRESSION & ESCALATION (Nén độ giật trên Server)
        if (payload.weapon && _global.__OmniState.weapon.isFiring) {
            const profile = _global.__OmniState.weaponProfile;
            
            // Lấy lệnh Nén độ giật từ Hồ sơ Vũ khí (Module 1)
            if (profile && profile.RecoilCompression !== undefined) {
                // Trên màn hình đt súng vẫn giật lên tự nhiên, nhưng gửi lên Server chỉ còn 5% độ giật
                if (payload.weapon.recoil_accumulation) {
                    payload.weapon.recoil_accumulation *= profile.RecoilCompression; 
                }
                if (payload.weapon.progressive_spread) {
                    payload.weapon.progressive_spread *= profile.RecoilCompression; // Nén nở tâm
                }
            }
        }

        // 3. DUAL-VECTOR EXECUTION & TRUE pSILENT (Xử lý phần Bắn - Tia Raycast tàng hình)
        if (payload.damage_report || payload.hit_event || payload.fire_event || payload.bullet_hit) {
            const targetState = _global.__OmniState.target;
            
            // Kích hoạt khi có tọa độ TƯƠNG LAI từ M4 và đang bóp cò
            if (targetState.id && targetState.predicted_pos && _global.__OmniState.weapon.isFiring) {
                
                // Cưỡng chế sát thương găm vào Lõi sọ
                payload.target_id = targetState.id;
                payload.hit_bone = 8;
                payload.is_headshot = true;
                if (payload.ignore_armor !== undefined) payload.ignore_armor = true;

                // TÍNH TOÁN VECTOR NGẮM TÀNG HÌNH (Vector pSilent)
                const origin = _global.__OmniState.self.anchorPos;
                const futureHead = targetState.predicted_pos;
                
                const dx = futureHead.x - origin.x;
                const dy = futureHead.y - origin.y;
                const dz = futureHead.z - origin.z;
                const distXZ = Math.sqrt(dx * dx + dz * dz);
                
                const silentYaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
                const silentPitch = Math.atan2(-dy, distXZ) * (180.0 / Math.PI);

                // Bẻ cong đường đạn vật lý mà không làm thay đổi Camera của người chơi
                if (payload.aim_yaw !== undefined) payload.aim_yaw = silentYaw;
                if (payload.aim_pitch !== undefined) payload.aim_pitch = silentPitch;

                // TIME-WARP BACKTRACK: Nếu địch ở xa (>10m), lùi sâu thời gian để lưới đạn bọc hậu cái bóng quá khứ
                if (payload.client_timestamp !== undefined && targetState.distance > 10.0) {
                    const backtrackPing = _global.__OmniState.currentPing + 150.0; // Lùi thêm 150ms
                    payload.client_timestamp -= backtrackPing;
                }

                // Gắn tọa độ va chạm vào điểm tương lai
                if (payload.hit_pos !== undefined) {
                    payload.hit_pos = { ...futureHead };
                }
            }
        }

        return payload;
    }
}

// ============================================================================
// MODULE 6: ONE-TAP CORE (SÁT THỦ ĐƠN VIÊN)
// Nhiệm vụ: Shot-Cancellation, Triggerbot, Trigger-Backtrack & 1-Tick Flick
// ============================================================================
class OneTapCore {
    static execute(payload) {
        
        let targetLocked = false;
        let ghostTimestamp = null;
        let perfectTargetPos = null;

        const targetState = _global.__OmniState.target;
        const profile = _global.__OmniState.weaponProfile;

        // 1. QUÉT GIAO CẮT BÓNG MA (Ghost Trajectory Intersection)
        // Kích hoạt khi Module 4 đã chốt được tọa độ tương lai của mục tiêu
        if (targetState.id && targetState.predicted_pos) {
            perfectTargetPos = targetState.predicted_pos; // Mặc định điểm bắn là Tương lai

            const state = _global.__OmniState.tracker[targetState.id];
            
            // Giả lập phóng tia Raycast kiểm tra xem góc nhìn hiện tại có cắt bóng ma quá khứ nào không
            if (state && state.history && payload.aim_yaw !== undefined) {
                for (let i = state.history.length - 1; i >= 0; i--) {
                    const ghost = state.history[i];
                    const dx = ghost.pos.x - _global.__OmniState.self.anchorPos.x;
                    const dz = ghost.pos.z - _global.__OmniState.self.anchorPos.z;
                    const ghostYaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
                    
                    let yawDiff = Math.abs(payload.aim_yaw - ghostYaw);
                    if (yawDiff > 180) yawDiff = 360 - yawDiff;

                    // Nếu góc ngắm người chơi lướt qua bóng ma (Sai số < 5 độ FOV)
                    if (yawDiff < 5.0) {
                        targetLocked = true;
                        ghostTimestamp = ghost.time;
                        perfectTargetPos = ghost.pos;
                        break; // Ưu tiên bắn bóng ma gần nhất để Backtrack
                    }
                }
            }

            // Nếu không cắt bóng ma, nhưng tia ngắm cắt thẳng vào điểm tương lai
            if (!targetLocked && payload.aim_yaw !== undefined) {
                const dx = targetState.predicted_pos.x - _global.__OmniState.self.anchorPos.x;
                const dz = targetState.predicted_pos.z - _global.__OmniState.self.anchorPos.z;
                const predYaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
                let yawDiff = Math.abs(payload.aim_yaw - predYaw);
                if (yawDiff > 180) yawDiff = 360 - yawDiff;
                
                if (yawDiff < 5.0) targetLocked = true;
            }
        }

        // 2. SHOT-CANCELLATION (Đánh giá Rủi ro và Ngậm đạn xịt)
        if (payload.weapon && (payload.weapon.is_firing || _global.__OmniState.weapon.isFiring)) {
            // Hỏi Module 5 xem đã phanh tĩnh chưa?
            if (profile && profile.RequireZeroVelocity && !_global.__OmniState.self.isPerfectlyStill) {
                // Nếu chưa đứng im -> Hủy phát bắn. Ép ngậm đạn để không bị nở tâm (Spread)
                payload.weapon.is_firing = false;
                if (payload.fire_event !== undefined) delete payload.fire_event;
                _global.__OmniState.weapon.isFiring = false;
            } else {
                // Đã tĩnh 100% -> Sẵn sàng khai hỏa
                _global.__OmniState.weapon.isFiring = true;
            }
        }

        // 3. ALGORITHMIC TRIGGERBOT (Tự động bóp cò)
        // Nếu mục tiêu đã lọt vào vùng giao cắt (targetLocked) VÀ Profile cho phép TriggerBot
        if (targetLocked && profile && profile.AllowTriggerBot && payload.weapon && !_global.__OmniState.weapon.isFiring) {
            // Lệnh tự động bóp cò ngay mili-giây hoàn hảo nhất
            payload.weapon.is_firing = true;
            _global.__OmniState.weapon.isFiring = true;
        }

        // 4. 1-TICK PHANTOM FLICK & HÀNH QUYẾT BÓNG MA (Tiêm sát thương tuyệt đối)
        if (payload.damage_report || payload.hit_event || payload.fire_event || payload.bullet_hit || _global.__OmniState.weapon.isFiring) {
            if (targetState.id && perfectTargetPos) {
                
                // Khóa Headshot cứng
                payload.target_id = targetState.id;
                payload.hit_bone = 8;
                payload.is_headshot = true;
                if (payload.ignore_armor !== undefined) payload.ignore_armor = true;

                // 1-TICK FLICK: Cưỡng chế bẻ góc tia đạn (Raycast) ngay trong khung hình bóp cò
                const origin = _global.__OmniState.self.anchorPos;
                const dx = perfectTargetPos.x - origin.x;
                const dy = perfectTargetPos.y - origin.y;
                const dz = perfectTargetPos.z - origin.z;
                const distXZ = Math.sqrt(dx * dx + dz * dz);
                
                const snapYaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
                const snapPitch = Math.atan2(-dy, distXZ) * (180.0 / Math.PI);

                if (payload.aim_yaw !== undefined) payload.aim_yaw = snapYaw;
                if (payload.aim_pitch !== undefined) payload.aim_pitch = snapPitch;

                // TRIGGER-BACKTRACK: Ép máy chủ lùi thời gian về thời điểm bóng ma đó thực sự tồn tại
                if (ghostTimestamp && payload.client_timestamp !== undefined) {
                    const timeDiff = Date.now() - ghostTimestamp;
                    payload.client_timestamp -= (_global.__OmniState.currentPing + timeDiff);
                }

                if (payload.hit_pos !== undefined) {
                    payload.hit_pos = { ...perfectTargetPos };
                }
            }
        }

        return payload;
    }
}

// ============================================================================
// BỘ ĐIỀU PHỐI ĐƯỜNG ỐNG (ONE-WAY MATRIX DISPATCHER)
// ============================================================================
class MatrixDispatcher {
    processPayload(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        // Xử lý đệ quy mảng tốc độ cao
        if (Array.isArray(payload)) {
            for (let i = 0; i < payload.length; i++) payload[i] = this.processPayload(payload[i]);
            return payload;
        }

        // BƯỚC 1: ĐỒNG BỘ THỜI KHÔNG VÀ CẬP NHẬT TRẠNG THÁI KHÍ TÀI (M1)
        if (payload.ping !== undefined) {
            _global.__OmniState.currentPing = (_global.__OmniState.currentPing * 0.7) + (payload.ping * 0.3);
        }
        if (payload.player_pos) {
            _global.__OmniState.self.anchorPos = { ..._global.__OmniState.self.pos };
            _global.__OmniState.self.pos = payload.player_pos;
        }

        // Nhận diện ngay khi có vũ khí
        if (payload.weapon) {
            _global.__OmniState.weapon.isFiring = !!(payload.weapon.is_firing || payload.weapon.recoil_accumulation > 0);
            _global.__OmniState.weapon.id = payload.weapon.id;
            _global.__OmniState.weapon.category = payload.weapon.category;
            
            // Lệnh cấp phát Hồ sơ từ Module 1
            _global.__OmniState.weaponProfile = WeaponClassifier.getProfile(payload.weapon);
        }

        // NẾU HỒ SƠ LÀ "IGNORE", BỎ QUA TOÀN BỘ ĐƯỜNG ỐNG PHÍA DƯỚI ĐỂ TIẾT KIỆM CPU
        if (_global.__OmniState.weaponProfile && _global.__OmniState.weaponProfile.Core !== "IGNORE") {
            
            // BƯỚC 2: THANH TẨY QUÁN TÍNH BẢN THÂN (M5)
            // payload = SelfKinematics.processSelfState(payload);

            // BƯỚC 3: DỰ ĐOÁN QUỸ ĐẠO KẺ ĐỊCH (M4)
            // payload = TargetKinematics.processTargetState(payload);

                        // BƯỚC 4: ĐỊNH TUYẾN SÁT THƯƠNG THEO LÕI (M2, M3, M6)
            const core = _global.__OmniState.weaponProfile.Core;
            if (core === "SHOTGUN") {
                payload = ShotgunCore.execute(payload);
            } 
            else if (core === "AUTO") {
                payload = AutoCore.execute(payload);
            } 
            else if (core === "ONETAP") {
                payload = OneTapCore.execute(payload);
            }


        // Định tuyến quy đệ quy tìm các node con
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
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"hit_bone"') !== -1 || $response.body.indexOf('"weapon"') !== -1 || $response.body.indexOf('"fire_origin"') !== -1) {
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
