/**
 * ==============================================================================
 * PROJECT: VORTEX-ASSIST V7.0 [MECHANICAL-ORGANIC SYNERGY]
 * Objective: 2D Screen-Center Culling, Vector Guidance, Delta-X Strafe Tracking,
 * Marksman Inverse-Braking, ADS 15px Pre-kick.
 * Environment: iOS Shortcuts / JSBridge
 * ==============================================================================
 */

const _vortex = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);

// ============================================================================
// LỚP 6: DEEP DATA HIJACKER (MẠNG LƯỚI BẮT CÓC VÀ QUÉT DỮ LIỆU SÂU)
// Nhiệm vụ: Xuyên thủng Sandbox, cướp quyền JSBridge, WebSocket và DOM để 
// hớt tay trên gói tin tọa độ/máu của Server trước khi Game Engine kịp giấu đi.
// ============================================================================
class DeepDataHijacker {
	static initialize() {
		const _vortex = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
		
		// Chốt chặn an toàn: Ngăn chặn việc tiêm đúp (Double Inject) gây crash game
		if (_vortex.__HijackerInitialized) return;
		_vortex.__HijackerInitialized = true;

		// --------------------------------------------------------------------
		// 1. CƯỚP QUYỀN WEBSOCKET (Nghe lén kết nối mạng thời gian thực)
		// Free Fire Web UI thường dùng WebSockets để đồng bộ vị trí địch ở xa
		// --------------------------------------------------------------------
		const OrigWebSocket = window.WebSocket;
		if (OrigWebSocket) {
			window.WebSocket = function(url, protocols) {
				const ws = new OrigWebSocket(url, protocols);
				
				// Cắm ống nghe vào đường truyền nhận dữ liệu
				ws.addEventListener('message', function(event) {
					try {
						if (event.data && typeof event.data === 'string') {
							// Bộ lọc Regex siêu tốc: Chỉ bắt các gói tin nghi ngờ chứa tọa độ
							if (event.data.includes("pos") || event.data.includes("players") || 
								event.data.includes("enemy") || event.data.includes("hp")) {
								
								let secretData = JSON.parse(event.data);
								if (secretData && _vortex.__VORTEX_ENGINE) {
									// Ép hệ thống VORTEX xử lý ngay dữ liệu mật này
									// Dữ liệu này "sạch" và "đầy đủ" hơn rất nhiều so với payload thông thường
									_vortex.__VORTEX_ENGINE.processPayload(secretData);
								}
							}
						}
					} catch (e) {
						// Im lặng bỏ qua lỗi parse JSON để không làm khựng khung hình
					}
				});
				return ws;
			};
		}

		// --------------------------------------------------------------------
		// 2. CƯỚP QUYỀN NATIVE-TO-JS (Nghe lén lõi C++ iOS gửi xuống UI)
		// Trực tiếp đánh chặn hàm postMessage toàn cục
		// --------------------------------------------------------------------
		const originalPostMessage = window.postMessage;
		window.postMessage = function(message, targetOrigin, transfer) {
			try {
				if (message && typeof message === 'object') {
					// Bắt cóc gói tin chứa Entity List
					if (message.players || message.enemy_list || message.hitboxes || message.entities) {
						if (_vortex.__VORTEX_ENGINE) {
							_vortex.__VORTEX_ENGINE.processPayload(message);
						}
					}
				}
			} catch (e) {}
			// Trả lại luồng chạy cho UI Game để hình ảnh vẫn hiển thị bình thường
			return originalPostMessage.apply(this, arguments);
		};

		// --------------------------------------------------------------------
		// 3. CƯỚP QUYỀN JS-TO-NATIVE (Trói cầu nối WKWebView MessageHandlers)
		// --------------------------------------------------------------------
		if (window.webkit && window.webkit.messageHandlers) {
			for (let handlerName in window.webkit.messageHandlers) {
				if (Object.prototype.hasOwnProperty.call(window.webkit.messageHandlers, handlerName)) {
					let handler = window.webkit.messageHandlers[handlerName];
					let origPostMessage = handler.postMessage;
					
					handler.postMessage = function(msg) {
						// [TIỀM NĂNG]: Tại đây có thể chặn các hàm Anti-Cheat gửi báo cáo 
						// "Hành vi bất thường" lên server iOS Native.
						// Tạm thời Proxy nguyên vẹn để bypass an toàn.
						return origPostMessage.apply(this, arguments);
					};
				}
			}
		}

		// --------------------------------------------------------------------
		// 4. MẠNG NHỆN DÒ QUÉT BỘ NHỚ (MEMORY SPIDER CRAWLER)
		// Chạy ngầm 1 lần duy nhất để tìm các Mảng Tọa Độ bị giấu kín trong RAM
		// --------------------------------------------------------------------
		setTimeout(() => {
			const keywords = ['player', 'enemy', 'entities', 'actors', 'combatants'];
			const MAX_DEPTH = 3; // Giới hạn đào sâu 3 tầng để không làm tràn RAM

			function crawlMemory(obj, currentDepth, path) {
				if (currentDepth > MAX_DEPTH || !obj || typeof obj !== 'object') return;
				
				for (let key in obj) {
					try {
						let keyLower = key.toLowerCase();
						// Nhận diện mảng chứa nhiều hơn 1 thực thể (Có thể là danh sách Địch)
						if (keywords.some(kw => keyLower.includes(kw)) && Array.isArray(obj[key]) && obj[key].length > 0) {
							// Lưu lại kho báu vào biến toàn cục để Mắt Thần (Bước 2) có thể gọi ra xài
							_vortex.__HiddenEntitiesList = obj[key]; 
						}
						crawlMemory(obj[key], currentDepth + 1, path + "." + key);
					} catch (e) {
						// Bỏ qua vùng nhớ bị hệ điều hành khóa quyền (CORS/Private)
					}
				}
			}
			
			crawlMemory(window, 0, "window");
		}, 3500); // Trì hoãn 3.5 giây để chờ game load xong hoàn toàn 100% dữ liệu
	}
}

// Khởi động Hệ thống Bắt cóc ngay lập tức
DeepDataHijacker.initialize();

// ============================================================================
// 0. VORTEX STATE V7.0 (BỘ NHỚ TOÀN CỤC)
// Đã mở rộng để hỗ trợ Ma trận 2D và Bám đuổi Trục X
// ============================================================================
if (!_vortex.__VortexState || _vortex.__VortexState.version !== "VORTEX_V7.0") {
    _vortex.__VortexState = {
        version: "VORTEX_V7.0",
        
        // Trạng thái Input (Ngón tay & Ống ngắm)
        input: { 
            rawX: 0, rawY: 0, 
            smoothX: 0, smoothY: 0,
            magnitude: 0, 
            isSwiping: false,
            dirX: 0, dirY: 0
        },

        // Trạng thái Vũ khí (Bổ sung MARKSMAN)
        weapon: { 
            type: "NONE", // Có thể là: SHOTGUN, SMG, AR, MARKSMAN, SNIPER
            isFiring: false, 
            bulletCount: 0,
            currentWeaponId: null
        },
        
        // Trạng thái Mục tiêu (Bổ sung 2D Distance & X-Axis Delta Tracking)
        target: { 
            id: null, 
            scanFrame: 0,
            distance3D: 999.0, 
            distance2D: 999.0,    // Khoảng cách Pixel trên màn hình (Tính từ Tâm chữ thập)
            pitchError: 999.0,    // Trục Y 3D
            yawError: 999.0,      // Trục X 3D
            enemyDeltaYaw: 0.0    // Vận tốc lướt ngang của địch trong 1 frame (Để Auto-Pull X)
        },

        // Động cơ Vật lý (Engine)
        engine: {
            isADS: false,          // Cờ nhận diện đang bật Scope
            thrustMultiplier: 1.0, 
            isABSBraking: false,
            remX: 0, remY: 0       // Bộ nhớ đệm Sub-pixel
        },

        localPlayer: {
            velocityY: 0.0,
            displacementY: 0.0
        }
    };
}

// ============================================================================
// BƯỚC 0.5: MEMORY AUTO-FLUSHER & SANITIZER (TỰ ĐỘNG DỌN DẸP & LỌC NHIỄU)
// Nhiệm vụ 1: Lọc bỏ các gói tin rác (NaN, Undefined) do lag mạng gây văng tâm.
// Nhiệm vụ 2: Tự động nhận diện trận đấu mới/sảnh chờ để xóa sạch "bóng ma" ván trước.
// Đảm bảo ván nào cũng có độ nhạy và lực kéo hoàn hảo như ván đầu tiên.
// ============================================================================
class MemoryAutoFlusher {
    static execute(payload) {
        const state = _vortex.__VortexState;

        // --------------------------------------------------------------------
        // [CÔNG NGHỆ BỔ SUNG] 1. SANITIZER: LỌC NHIỄU DỮ LIỆU ĐẦU VÀO (CHỐNG VĂNG TÂM)
        // Bắt các trường hợp payload bị rách do mạng lag (Ping 999+) hoặc Game Engine lỗi
        // --------------------------------------------------------------------
        if (payload.touch_delta) {
            if (isNaN(payload.touch_delta.x) || typeof payload.touch_delta.x !== 'number') payload.touch_delta.x = 0;
            if (isNaN(payload.touch_delta.y) || typeof payload.touch_delta.y !== 'number') payload.touch_delta.y = 0;
        }
        if (payload.camera) {
            // Nếu góc Camera bị mất dữ liệu, trả về số 0 để các phép tính toán học (Math.sqrt, atan2) ở Bước 2 không bị sập (Crash).
            if (isNaN(payload.camera.pitch) || typeof payload.camera.pitch !== 'number') payload.camera.pitch = 0;
            if (isNaN(payload.camera.yaw) || typeof payload.camera.yaw !== 'number') payload.camera.yaw = 0;
        }

        // --------------------------------------------------------------------
        // 2. NHẬN DIỆN TÍN HIỆU TRẬN MỚI (MATCH RESTART SENSOR)
        // --------------------------------------------------------------------
        let isNewMatch = false;

        // Cờ A: Nếu Game truyền thẳng trạng thái trận đấu (Sảnh chờ / Đang bay)
        if (payload.match_state && (payload.match_state === "LOBBY" || payload.match_state === "START")) {
            isNewMatch = true;
        } 
        // Cờ B: Nếu ID của trận đấu thay đổi
        else if (payload.match_id && payload.match_id !== state.currentMatchId) {
            isNewMatch = true;
            state.currentMatchId = payload.match_id;
        } 
        // Cờ C (Quan trọng nhất): Nhận diện biến động qua số lượng người chơi
        // Nếu đột ngột tụt về 0 (Ra sảnh) hoặc đột ngột tăng vọt lên 50 (Lên máy bay)
        else {
            let currentPlayerCount = payload.players ? payload.players.length : 0;
            if (state.lastPlayerCount !== undefined) {
                if ((currentPlayerCount === 0 && state.lastPlayerCount > 10) || 
                    (currentPlayerCount > 20 && state.lastPlayerCount < 5)) {
                    isNewMatch = true;
                }
            }
            state.lastPlayerCount = currentPlayerCount;
        }

        // --------------------------------------------------------------------
        // 3. KÍCH HOẠT QUY TRÌNH LỌC MÁU BỘ NHỚ (FLUSH)
        // --------------------------------------------------------------------
        if (isNewMatch) {
            // Xóa sạch bộ nhớ Mục tiêu (Kẻ địch ván trước, bóng ma, tọa độ cũ)
            state.target = { 
                id: null, 
                scanFrame: 0, 
                distance3D: 999.0, 
                distance2D: 999.0, 
                pitchError: 999.0, 
                yawError: 999.0, 
                enemyDeltaYaw: 0.0,
                lastHeadPos: { x: 0, y: 0, z: 0 },
                lastVelocity: { x: 0, y: 0, z: 0 },
                ghostFrames: 0
            };
            
            // Xóa sạch lực tay dư thừa và cờ khóa của Động cơ Vật lý
            state.engine = {
                isADS: false, 
                thrustMultiplier: 1.0, 
                isABSBraking: false, 
                remX: 0, 
                remY: 0,
                wasADS: false,
                adsCalmFrames: 0
            };
            
            // Xóa lực kéo cảm ứng và gia tốc EMA đang lưu trữ
            state.input = { 
                rawX: 0, rawY: 0, 
                smoothX: 0, smoothY: 0,
                magnitude: 0, 
                isSwiping: false, 
                dirX: 0, dirY: 0 
            };

            // Trả bộ đếm đạn và trạng thái bản thân về mặc định
            state.weapon.bulletCount = 0;
            state.weapon.isFiring = false;
            
            if (state.localPlayer) {
                state.localPlayer.velocityY = 0.0;
                state.localPlayer.displacementY = 0.0;
            }
        }

        return payload;
    }
}

// ============================================================================
// BƯỚC 1: INPUT INTERCEPTOR (Đọc lệnh ngón tay & Khử nhiễu)
// Nhiệm vụ: Đọc lực tay thô, làm mượt EMA, tính toán Vector Không Gian 2D.
// ============================================================================
class InputInterceptor {
    static execute(payload) {
        const inputState = _vortex.__VortexState.input;

        // 1. TRÍCH XUẤT LỰC VUỐT THÔ (RAW INPUT)
        let rawX = 0;
        let rawY = 0;

        if (payload.touch_delta) {
            rawX = payload.touch_delta.x || 0;
            rawY = payload.touch_delta.y || 0;
        } else if (payload.input_drag) {
            rawX = payload.input_drag.x || 0;
            rawY = payload.input_drag.y || 0;
        } else if (payload.mouse_delta) {
            rawX = payload.mouse_delta.x || 0;
            rawY = payload.mouse_delta.y || 0;
        }

        inputState.rawX = rawX;
        inputState.rawY = rawY;

        // 2. KỸ THUẬT LỌC NHIỄU "SUB-PIXEL EMA SMOOTHING"
        // Alpha = 0.45: Cân bằng hoàn hảo giữa độ mượt và phản hồi tức thời.
        const ALPHA = 0.5; 
        
        if (inputState.smoothX === undefined) inputState.smoothX = 0;
        if (inputState.smoothY === undefined) inputState.smoothY = 0;

        inputState.smoothX = (rawX * ALPHA) + (inputState.smoothX * (1.0 - ALPHA));
        inputState.smoothY = (rawY * ALPHA) + (inputState.smoothY * (1.0 - ALPHA));

        // 3. TOÁN HỌC VECTOR (TÍNH ĐỘ LỚN & HƯỚNG)
        let mag = Math.sqrt(inputState.smoothX ** 2 + inputState.smoothY ** 2);

        // 4. BỘ LỌC MICRO-DEADZONE (Chống trôi tâm khi tay run)
        if (mag < 1.0) {
            inputState.smoothX = 0;
            inputState.smoothY = 0;
            inputState.magnitude = 0;
            inputState.isSwiping = false;
            
            inputState.dirX = 0;
            inputState.dirY = 0;
        } else {
            inputState.magnitude = mag;
            inputState.isSwiping = true;
            
            // Tính toán Vector Hướng (Từ -1.0 đến 1.0) để Bước 3 bẻ cong quỹ đạo
            inputState.dirX = inputState.smoothX / mag;
            inputState.dirY = inputState.smoothY / mag;
        }

        return payload;
    }
}

// ============================================================================
// BƯỚC 1.5: WEAPON ANALYZER (Phân loại súng & Đếm đạn)
// Nhiệm vụ: Tách biệt hoàn toàn súng nảy mạnh (MARKSMAN) khỏi AR/SMG/SG.
// [V7.3 UPDATE]: Khai tử hoàn toàn Súng Ngắm (Sniper), gán về trạng thái NONE.
// ============================================================================
class WeaponAnalyzer {
    static execute(payload) {
        const weaponState = _vortex.__VortexState.weapon;

        // ==========================================================
        // 1. PROGRESSIVE BULLET COUNTER (ĐẾM CHU KỲ XẢ ĐẠN)
        // ==========================================================
        let currentlyFiring = false;
        
        if (payload.is_firing !== undefined) {
            currentlyFiring = payload.is_firing;
        } else if (payload.weapon && payload.weapon.is_firing !== undefined) {
            currentlyFiring = payload.weapon.is_firing;
        }

        // Logic đếm số viên đạn đã bắn ra trong 1 lần đè cò
        if (currentlyFiring) {
            if (!weaponState.isFiring) {
                weaponState.bulletCount = 1; // Viên đầu tiên
            } else {
                weaponState.bulletCount += 1;
            }
        } else {
            weaponState.bulletCount = 0;
        }
        
        weaponState.isFiring = currentlyFiring;

        // ==========================================================
        // 2. ZERO-GC CLASSIFICATION (PHÂN LOẠI VŨ KHÍ)
        // ==========================================================
        if (payload.weapon) {
            const currentId = payload.weapon.id || "UNKNOWN";
            
            // Chỉ chạy thuật toán phân loại khi người chơi đổi súng (Tiết kiệm CPU)
            if (currentId !== weaponState.currentWeaponId) {
                weaponState.currentWeaponId = currentId;
                
                const identifier = `${currentId}_${payload.weapon.name || ""}_${payload.weapon.category || ""}`.toUpperCase();

                // [A]. NHÁNH MARKSMAN (Súng gõ 1 viên, độ nảy nòng cực gắt)
                if (identifier.includes("WOODPECKER") || identifier.includes("SKS") || 
                    identifier.includes("AC80") || identifier.includes("SVD") || 
                    identifier.includes("DESERT_EAGLE") || identifier.includes("DEAGLE") ||
                    identifier.includes("M590") || identifier.includes("M500") || 
                    identifier.includes("DRAGUNOV")) {
                    weaponState.type = "MARKSMAN";
                }
                // [B]. SHOTGUN (Hoa cải)
                else if (identifier.includes("SHOTGUN") || identifier.includes("M1887") || 
                         identifier.includes("M1014") || identifier.includes("MAG-7") || 
                         identifier.includes("SPAS") || identifier.includes("TROGON") || 
                         identifier.includes("CHARGE")) {
                    weaponState.type = "SHOTGUN";
                } 
                // [C]. SMG (Tiểu liên sấy)
                else if (identifier.includes("SMG") || identifier.includes("MP40") || 
                         identifier.includes("UMP") || identifier.includes("MAC10") || 
                         identifier.includes("MP5") || identifier.includes("VECTOR") || 
                         identifier.includes("THOMPSON") || identifier.includes("P90") || 
                         identifier.includes("BIZON")) {
                    weaponState.type = "SMG";
                } 
                // [D]. AR (Súng trường sấy tự động)
                else if (identifier.includes("AR") || identifier.includes("RIFLE") || 
                         identifier.includes("AK") || identifier.includes("SCAR") || 
                         identifier.includes("M4A1") || identifier.includes("FAMAS") || 
                         identifier.includes("XM8") || identifier.includes("GROZA") || 
                         identifier.includes("AUG") || identifier.includes("PISTOL")) {
                    weaponState.type = "AR";
                } 
                // [E]. TRẠNG THÁI NONE (Khai tử Sniper, Vũ khí cận chiến, Lựu đạn)
                // Bất kỳ súng nào không lọt vào A, B, C, D (bao gồm cả AWM, KAR98) sẽ rơi vào đây
                else {
                    weaponState.type = "NONE";
                }
            }
        }

        return payload;
    }
}

// ============================================================================
// BƯỚC 2.5: SELF-KINEMATIC ISOLATOR (CÁCH LY ĐỘNG HỌC BẢN THÂN)
// Công nghệ: 
// 1. Zero-Stance Illusion (Đánh lừa trạng thái di chuyển để chống Nở Tâm).
// 2. Tách xuất Vận tốc Y để phục vụ Bù trừ điểm ngắm.
// ============================================================================
class SelfKinematicIsolator {
    static execute(payload) {
        const state = _vortex.__VortexState;
        
        // Tìm kiếm dữ liệu của chính người chơi (Bản thân)
        let myPlayer = payload.local_player || payload.my_player;
        if (!myPlayer && payload.players) {
            // Nội suy nếu Game giấu trong mảng chung
            for (let i = 0; i < payload.players.length; i++) {
                if (payload.players[i].is_local || payload.players[i].id === payload.my_id) {
                    myPlayer = payload.players[i];
                    break;
                }
            }
        }

        if (myPlayer) {
            // [CÔNG NGHỆ 4]: TRÍCH XUẤT VẬN TỐC TRỤC Y (Trọng lực/Nhảy)
            // Lấy vận tốc thực tế trước khi hệ thống đánh tráo nó về 0
            let myVelY = myPlayer.real_velocity ? myPlayer.real_velocity.y : (myPlayer.velocity ? myPlayer.velocity.y : 0);
            state.localPlayer.velocityY = myVelY;
            
            // Tính toán khoảng dịch chuyển dự kiến của Camera trong 1 Frame (16ms)
            state.localPlayer.displacementY = myVelY * 0.016;

            // [CÔNG NGHỆ 1]: ZERO-STANCE ILLUSION (Ảo ảnh Đứng im)
            // Ép Game Engine tin rằng bạn đang ngồi/đứng im tĩnh lặng để triệt tiêu Movement Bloom
            myPlayer.is_moving = false;
            myPlayer.is_jumping = false;
            myPlayer.is_falling = false;
            myPlayer.is_crouching = true; // Ép trạng thái về Ngồi (Độ tản mát nhỏ nhất)
            
            if (myPlayer.velocity) {
                myPlayer.velocity.x = 0.0; myPlayer.velocity.y = 0.0; myPlayer.velocity.z = 0.0;
            }
            if (myPlayer.real_velocity) {
                myPlayer.real_velocity.x = 0.0; myPlayer.real_velocity.y = 0.0; myPlayer.real_velocity.z = 0.0;
            }
        }

        // Bọc lót đánh lừa trực tiếp tham số Vũ khí (Weapon Movement Multiplier)
        if (payload.weapon) {
            payload.weapon.is_moving = false;
            payload.weapon.is_jumping = false;
            if (payload.weapon.movement_spread_multiplier !== undefined) payload.weapon.movement_spread_multiplier = 0.0;
            if (payload.weapon.jump_spread_multiplier !== undefined) payload.weapon.jump_spread_multiplier = 0.0;
        }

        return payload;
    }
}

// ============================================================================
// BƯỚC 2: TARGET SCANNER 2D-3D (MẮT THẦN QUÉT ĐA LỚP V7.8 - GHOST PROTOCOL)
// Hợp thể 7 Công nghệ Hủy diệt Không gian:
// 1. Absolute Target Persistence: Khóa chết mục tiêu bất tử khi đè cò (isFiring).
// 2. Mechanical Circuit Breaker: Ngắt cầu chì (Đổi mục tiêu) bằng cú vuốt > 15px.
// 3. Cross-Path Ghosting: Nội suy bóng ma 200ms khi mất dấu / bị che khuất.
// 4. Aspect Ratio Culling: Ma trận quét 2D hình Elip chuẩn tỷ lệ 16:9 (Hệ số 1.77).
// 5. Real Head Tracking: Bám đuổi tọa độ Sọ/Cổ thực tế, loại bỏ mỏ neo tĩnh.
// 6. Dynamic Aim-Offset: Bù trừ trọng lực/gia tốc rơi của bản thân.
// 7. Ultra-Magnetism: Khử ma sát tứ chi (Zero-Friction), dồn từ tính vào Sọ.
// ============================================================================
class TargetScanner2D3D {
    
    // Hàm chuẩn hóa góc quay (-180 đến 180 độ) để tính FOV chính xác
    static normalizeAngle(angle) {
        while (angle > 180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }

    static execute(payload) {
        const state = _vortex.__VortexState;
        
        if (!payload.players || !Array.isArray(payload.players)) return payload;

        let origin = payload.fire_origin || payload.anchorPos;
        if (!origin || (origin.x === 0 && origin.y === 0)) return payload;

        let currentYaw = payload.aim_yaw !== undefined ? payload.aim_yaw : (payload.camera ? payload.camera.yaw : 0.0);
        let currentPitch = payload.aim_pitch !== undefined ? payload.aim_pitch : (payload.camera ? payload.camera.pitch : 0.0);

        let isADS = payload.is_ads || (payload.camera && payload.camera.fov && payload.camera.fov < 60.0);
        state.engine.isADS = isADS;

        // Khởi tạo các biến nội suy Bóng Ma (Cross-Path Ghosting) nếu chưa có
        if (state.target.ghostFrames === undefined) state.target.ghostFrames = 0;
        if (!state.target.lastHeadPos) state.target.lastHeadPos = { x: 0, y: 0, z: 0 };
        if (!state.target.lastVelocity) state.target.lastVelocity = { x: 0, y: 0, z: 0 };

        if (!state.target.scanFrame) state.target.scanFrame = 0;
        state.target.scanFrame++;

        let previousTargetId = state.target.id;
        let previousEnemyYaw = state.target.lastEnemyYaw || 0.0; 

        // ====================================================================
        // [CÔNG NGHỆ 2]: MECHANICAL CIRCUIT BREAKER (NGẮT CẦU CHÌ CƠ HỌC)
        // Nếu đang sấy, nhưng ngón tay miết một lực cực gắt (Magnitude > 15.0)
        // Hệ thống sẽ lập tức xé bỏ bản hợp đồng khóa chết, cho phép đổi mục tiêu.
        // ====================================================================
        let isFiring = state.weapon.isFiring;
        if (isFiring && state.target.id && state.input.magnitude > 15.0) {
            state.target.id = null;             // Giải phóng mục tiêu hiện tại
            state.target.ghostFrames = 0;       // Xóa bóng ma
            previousTargetId = null;            // Trắng bộ nhớ cục bộ
        }

        // ====================================================================
        // [CÔNG NGHỆ 1]: ABSOLUTE TARGET PERSISTENCE (KHÓA CHẾT MỤC TIÊU BẤT TỬ)
        // Khi súng đang nổ, Bước 2 mù hoàn toàn với mọi kẻ địch khác, chỉ nhìn thằng bị khóa.
        // ====================================================================
        let lockedTargetId = (isFiring && state.target.id) ? state.target.id : null;

        let bestTarget = null;
        let lowest2DDistance = 999999.0; 
        const ASPECT_RATIO = 1.77; // Tỷ lệ Elip 16:9

        // ====================================================================
        // A. AGGRESSIVE CULLING & ULTRA-MAGNETISM 
        // ====================================================================
        for (let i = 0; i < payload.players.length; i++) {
            let enemy = payload.players[i];
            
            // Lọc tử sĩ & Đồng đội
            if (enemy.is_dead || enemy.hp <= 0 || enemy.is_knocked || !enemy.pos) continue;
            if (enemy.is_teammate || (payload.my_team_id && enemy.team_id === payload.my_team_id)) continue;
            if (!enemy.hitboxes || (!enemy.hitboxes.head && !enemy.hitboxes.neck)) continue;

            // XUYÊN THỦNG VÒNG LẶP: Nếu đã khóa chết thằng A, bỏ qua mọi tính toán với thằng B, C, D
            if (lockedTargetId && enemy.id !== lockedTargetId) continue;

            // Lấy tọa độ thật + Nhân bản (Clone)
            let headRef = enemy.hitboxes.head ? enemy.hitboxes.head.pos : enemy.hitboxes.neck.pos;
            let headPos = { x: headRef.x, y: headRef.y, z: headRef.z };

            // Trích xuất vận tốc thực tế để phục vụ cho thuật toán Bóng Ma
            let enemyVel = enemy.real_velocity || enemy.velocity || { x: 0, y: 0, z: 0 };

            // [BÙ TRỪ GIA TỐC RƠI CỦA BẢN THÂN]
            let localDispY = state.localPlayer ? state.localPlayer.displacementY : 0.0;
            headPos.y -= localDispY; 

            let dx = headPos.x - origin.x;
            let dy = headPos.y - origin.y;
            let dz = headPos.z - origin.z;
            let distance3D = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            if (distance3D > 150.0) continue; 

            // [ULTRA-MAGNETISM: KHỬ MA SÁT TỨ CHI]
            const allBones = Object.keys(enemy.hitboxes);
            for (let b = 0; b < allBones.length; b++) {
                let boneName = allBones[b].toLowerCase();
                let bone = enemy.hitboxes[allBones[b]];

                if (boneName.includes('head') || boneName.includes('neck')) {
                    if (bone.radius) bone.radius = 0.5; 
                    bone.magnetism = 5.0;               
                    bone.snap_weight = 99999.0;
                } else {
                    if (bone.radius !== undefined) bone.radius = 0.0001;
                    bone.magnetism = 0.0; bone.friction = 0.0; bone.snap_weight = -99999.0;
                    if (bone.pos && bone.pos.z) bone.pos.z -= 1.5; 
                }
            }

            // TÍNH TOÁN 3D EULER & CHIẾU LÊN MẶT PHẲNG 2D MÀN HÌNH (ELIP)
            let distXZ = Math.sqrt(dx*dx + dz*dz) || 0.001;
            let enemyYaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
            let enemyPitch = -Math.atan2(dy, distXZ) * (180.0 / Math.PI);
            
            let rawDeltaYaw = TargetScanner2D3D.normalizeAngle(enemyYaw - currentYaw);
            let rawDeltaPitch = TargetScanner2D3D.normalizeAngle(enemyPitch - currentPitch);

            // [ASPECT RATIO CULLING]
            let scaledDeltaPitch = rawDeltaPitch * ASPECT_RATIO;
            let fov2D = Math.sqrt(rawDeltaYaw**2 + scaledDeltaPitch**2);

            let baseCapsule = (distance3D < 3.0) ? 180.0 : ((120.0 / distance3D) + 12.0);
            let capsuleFovLimit = isADS ? (baseCapsule * 0.35) : baseCapsule; 
            
            let isStickyTarget = (enemy.id === previousTargetId);
            if (isStickyTarget) capsuleFovLimit *= 1.5; 

            if (fov2D > capsuleFovLimit) continue;

            let stancePenalty = 1.0;
            let heightDiff = origin.y - headPos.y; 
            if (heightDiff > 0.8) stancePenalty *= 2.0; 
            if (enemy.is_behind_cover) stancePenalty *= 10.0;

            let stickyBonus = isStickyTarget ? 0.50 : 1.0;
            let score2D = fov2D * stancePenalty * stickyBonus;

            if (score2D < lowest2DDistance) {
                lowest2DDistance = score2D;

                let currentEnemyDeltaYaw = 0.0;
                if (isStickyTarget) {
                    currentEnemyDeltaYaw = TargetScanner2D3D.normalizeAngle(enemyYaw - previousEnemyYaw);
                }

                bestTarget = {
                    id: enemy.id, 
                    distance3D: distance3D,
                    distance2D: fov2D,                   
                    deltaPitch: rawDeltaPitch,           
                    deltaYaw: rawDeltaYaw,               
                    enemyDeltaYaw: currentEnemyDeltaYaw, 
                    absoluteEnemyYaw: enemyYaw,
                    // Lưu Trữ Dữ liệu Gốc phục vụ Bóng Ma
                    rawHeadPos: { x: headRef.x, y: headRef.y, z: headRef.z },
                    velocity: { x: enemyVel.x, y: enemyVel.y, z: enemyVel.z },
                    isGhost: false
                };
            }
        }

        // ====================================================================
        // B. [CÔNG NGHỆ 3]: CROSS-PATH GHOSTING (BÓNG MA GIAO CẮT)
        // Nếu mục tiêu Bất tử (lockedTargetId) bị che khuất / đè tọa độ và biến mất 
        // khỏi vòng lặp trên. Hệ thống mở cửa sổ nội suy tương lai trong 200ms.
        // ====================================================================
        if (lockedTargetId && !bestTarget) {
            // Cửa sổ 15 frames (~240 mili-giây)
            if (state.target.ghostFrames < 15) { 
                state.target.ghostFrames++;

                // Lấy tọa độ cũ + Vận tốc cũ * 16ms (Thời gian 1 frame)
                let lastPos = state.target.lastHeadPos;
                let lastVel = state.target.lastVelocity;
                
                let ghostHead = {
                    x: lastPos.x + (lastVel.x * 0.016),
                    y: lastPos.y + (lastVel.y * 0.016),
                    z: lastPos.z + (lastVel.z * 0.016)
                };

                // Tiếp tục bù trừ gia tốc rơi của bản thân cho Bóng Ma
                let localDispY = state.localPlayer ? state.localPlayer.displacementY : 0.0;
                ghostHead.y -= localDispY; 

                // Tính toán ma trận cho Bóng Ma y hệt như người thật
                let dx = ghostHead.x - origin.x;
                let dy = ghostHead.y - origin.y;
                let dz = ghostHead.z - origin.z;
                let distance3D = Math.sqrt(dx*dx + dy*dy + dz*dz);
                
                let distXZ = Math.sqrt(dx*dx + dz*dz) || 0.001;
                let enemyYaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
                let enemyPitch = -Math.atan2(dy, distXZ) * (180.0 / Math.PI);
                
                let rawDeltaYaw = TargetScanner2D3D.normalizeAngle(enemyYaw - currentYaw);
                let rawDeltaPitch = TargetScanner2D3D.normalizeAngle(enemyPitch - currentPitch);
                let scaledDeltaPitch = rawDeltaPitch * ASPECT_RATIO;
                let fov2D = Math.sqrt(rawDeltaYaw**2 + scaledDeltaPitch**2);

                bestTarget = {
                    id: lockedTargetId,
                    distance3D: distance3D,
                    distance2D: fov2D,
                    deltaPitch: rawDeltaPitch,
                    deltaYaw: rawDeltaYaw,
                    enemyDeltaYaw: state.target.enemyDeltaYaw, // Giữ nguyên vận tốc cũ
                    absoluteEnemyYaw: enemyYaw,
                    isGhost: true
                };

                // Cập nhật lại tọa độ gốc bằng tọa độ ảo để frame sau tiếp tục tịnh tiến
                state.target.lastHeadPos = { 
                    x: ghostHead.x, 
                    y: ghostHead.y + localDispY, // Trả lại y gốc chưa bù trừ để nội suy chuẩn
                    z: ghostHead.z 
                };

            } else {
                // Cửa sổ 200ms kết thúc, kẻ địch thực sự đã biến mất/chạy sau tường. Hủy cờ khóa.
                state.target.id = null;
                state.target.ghostFrames = 0;
            }
        }

        // ====================================================================
        // XUẤT BÁO CÁO CẬP NHẬT VÀO VORTEX STATE CHO BƯỚC 3 THỰC THI
        // ====================================================================
        if (bestTarget) {
            
            // Nếu là người thật (Không phải bóng ma), Reset cờ đếm và lưu lại Tọa độ Lịch sử
            if (!bestTarget.isGhost) {
                state.target.ghostFrames = 0;
                state.target.lastHeadPos = bestTarget.rawHeadPos;
                state.target.lastVelocity = bestTarget.velocity;
            }

            state.target.id = bestTarget.id;
            state.target.distance3D = bestTarget.distance3D;
            state.target.distance2D = bestTarget.distance2D;
            state.target.pitchError = bestTarget.deltaPitch; 
            state.target.yawError = bestTarget.deltaYaw;
            
            state.target.enemyDeltaYaw = bestTarget.enemyDeltaYaw;
            state.target.lastEnemyYaw = bestTarget.absoluteEnemyYaw;
        } else {
            state.target.id = null;
            state.target.ghostFrames = 0;
            state.target.distance3D = 999.0;
            state.target.distance2D = 999.0;
            state.target.pitchError = 999.0;
            state.target.yawError = 999.0;
            
            state.target.enemyDeltaYaw = 0.0;
        }

        return payload;
    }
}

// ============================================================================
// BƯỚC 3: VECTOR THRUST & GUIDANCE ENGINE (V7.9 OMNI-DIRECTIONAL DOMINANCE)
// Hợp thể các công nghệ tối thượng:
// 1. ADS Decapitation Protocol: Quick-scope cướp quyền Camera tức thời & Khiên chống giật.
// 2. Long-Range Hipfire (Khoảng cách > 8m):
//    - Depth-Scaling Thrust: Suy hao gia tốc theo chiều sâu 3D (Chống vọt lố).
//    - Dynamic Magnetic Expansion: Mở rộng vùng đệm từ tính lên 15.0 độ.
//    - Y-Axis Compression: Ép xẹp trục dọc (Y), giữ nguyên gia tốc trục ngang (X).
//    - Kinetic Energy Bleeding: Xả van áp suất, triệt tiêu lực vuốt tay hoảng loạn.
// 3. Asymmetric Snap-Lock: Lồng giam bất đối xứng (Dọc < 2.5 độ, Ngang < 6.0 độ).
// 4. Aggressive Velocity Blending: 75% AI dẫn đường + 25% Lực cơ học.
// ============================================================================
class VectorThrustEngine {
    
    // Hàm Đường cong Sigmoid (Gia tốc cơ bản)
    static calculateSigmoidThrust(distance2D) {
        const MAX_THRUST = 10.0; 
        const MIN_THRUST = 0.15; 
        const MID_POINT = 8.0; 
        const SLOPE = 6.0;      
        let progress = 1.0 / (1.0 + Math.exp((distance2D - MID_POINT) / SLOPE));
        return MIN_THRUST + (MAX_THRUST - MIN_THRUST) * progress;
    }

    static execute(payload) {
        const state = _vortex.__VortexState;
        const input = state.input;
        const target = state.target;
        const engine = state.engine;

        // Khởi tạo Bộ nhớ đệm Sub-pixel & Biến trạng thái Ống ngắm
        if (engine.remX === undefined) { engine.remX = 0; engine.remY = 0; }
        if (engine.wasADS === undefined) engine.wasADS = false;
        if (engine.adsCalmFrames === undefined) engine.adsCalmFrames = 0;

        // Trạng thái bật ống ngắm hiện tại
        let isADS = engine.isADS;

        // ====================================================================
        // [CÔNG NGHỆ ỐNG NGẮM]: ADS DECAPITATION PROTOCOL (GIAO THỨC ĐOẠT MẠNG)
        // Nhận diện khoảnh khắc Edge-Trigger (Vừa mới bấm nút bật Scope)
        // ====================================================================
        if (isADS && !engine.wasADS && target.id !== null) {
            // Kích hoạt Khiên chống giật ngược (Anti-Pullback Shield) trong 5 frames (khoảng 80ms)
            engine.adsCalmFrames = 5; 
        }
        engine.wasADS = isADS; // Lưu lại lịch sử cho frame tiếp theo

        // Nếu mất dấu mục tiêu -> Trả lại Payload
        if (!target.id) return payload; 
        if (!payload.touch_delta) payload.touch_delta = { x: 0, y: 0 };

        // Lực tay thô thực tế
        let rawX = payload.touch_delta.x + engine.remX;
        let rawY = payload.touch_delta.y + engine.remY;
        let currentMag = input.magnitude;

        let total2DError = target.distance2D; 
        let dist3D = target.distance3D;

        // Tách sai số trục Dọc và trục Ngang
        let absPitchErr = Math.abs(target.pitchError);
        let absYawErr = Math.abs(target.yawError);

        // ====================================================================
        // [CÔNG NGHỆ BẮN XA]: LONG-RANGE HIP-FIRE ISOLATION (Tầm > 8m, Không Scope)
        // ====================================================================
        let isLongRangeHipFire = (!isADS && dist3D > 8.0);
        
        // 1. Dynamic Magnetic Expansion: Mở rộng vùng đệm phanh từ 8.0 lên 15.0 độ
        let maxCushionLimit = isLongRangeHipFire ? 15.0 : 8.0;

        if (isLongRangeHipFire && currentMag > 0) {
            // 2. Kinetic Energy Bleeding (Xả Động Năng Dư Thừa do hoảng loạn tay)
            if (currentMag > 10.0) {
                let excess = currentMag - 10.0;
                let bleedFactor = 10.0 / (10.0 + excess * 0.6); // Triệt tiêu mượt mà lực thừa
                rawX *= bleedFactor;
                rawY *= bleedFactor;
                currentMag *= bleedFactor;
            }
        }

        let hasInput = input.isSwiping && currentMag > 0;

        // Buông tay ngoài Lồng giam -> Giải phóng Camera
        if (!hasInput && (absPitchErr >= 2.5 || absYawErr >= 6.0) && total2DError >= 0.5 && engine.adsCalmFrames === 0) {
            return payload;
        }

        // 3. Depth-Scaling Thrust: Tính toán suy hao gia tốc theo chiều sâu 3D
        let baseThrust = this.calculateSigmoidThrust(total2DError);
        if (isLongRangeHipFire) {
            // Địch càng xa (VD 24m), lực đẩy càng bị gọt giảm (8/24 = 33% lực gốc)
            let depthMultiplier = Math.max(0.35, 8.0 / dist3D); 
            baseThrust *= depthMultiplier;
        }

        let errMag = Math.sqrt(target.yawError**2 + target.pitchError**2) || 0.0001;
        let targetDirX = target.yawError / errMag; 
        let targetDirY = target.pitchError / errMag;
        
        let dotProduct = 0;
        if (hasInput) dotProduct = (input.dirX * targetDirX) + (input.dirY * targetDirY);

        let currentPitch = payload.camera ? payload.camera.pitch : (payload.aim_pitch || 0);
        let currentYaw = payload.camera ? payload.camera.yaw : (payload.aim_yaw || 0);
        
        let absoluteBonePitch = currentPitch + target.pitchError;
        let absoluteBoneYaw = currentYaw + target.yawError;

        // ====================================================================
        // [CÔNG NGHỆ LÕI]: AGGRESSIVE VELOCITY BLENDING (75% AI - 25% HUMAN)
        // ====================================================================
        let blendedRawX = rawX;
        let blendedRawY = rawY;

        if (hasInput && dotProduct > 0.0) {
            let idealVx = currentMag * targetDirX;
            let idealVy = currentMag * targetDirY;
            let systemDomination = 0.75; 
            blendedRawX = (rawX * (1.0 - systemDomination)) + (idealVx * systemDomination);
            blendedRawY = (rawY * (1.0 - systemDomination)) + (idealVy * systemDomination);
        }

        let autoPullX = target.enemyDeltaYaw * 30.0; 
        const X_AXIS_BOOST = 1.50; 

        // ====================================================================
        // GIAO THỨC ĐOẠT MẠNG ỐNG NGẮM (QUICK-SCOPE HIJACKING)
        // ====================================================================
        if (engine.adsCalmFrames > 0) {
            engine.adsCalmFrames--;
            engine.isABSBraking = true;
            
            // Cướp quyền Mỏ neo 3D: Dịch chuyển lập tức vào Sọ, bỏ qua cơ chế hút ngực của Game
            rawX = 0; rawY = 0;
            let perfectPitch = absoluteBonePitch + (target.pitchError > 0 ? -0.1 : 0.1); 

            if (payload.camera) { 
                payload.camera.pitch = perfectPitch; 
                payload.camera.yaw = absoluteBoneYaw; 
            } else { 
                payload.aim_pitch = perfectPitch; 
                payload.aim_yaw = absoluteBoneYaw; 
            }
            
            // Khiên chống Lực hút Ngược: Tê liệt vật lý game trong chớp mắt
            if (payload.camera_constraints) {
                payload.camera_constraints.friction = 0.0;
                payload.camera_constraints.damping = 0.0;
            }
        }
        // ====================================================================
        // PHA 1 & 3: TÂM BÃO TÀNG HÌNH & LỒNG GIAM BẤT ĐỐI XỨNG
        // ====================================================================
        else if (total2DError < 0.5) {
            engine.isABSBraking = true; 
            if (!hasInput) {
                if (payload.camera) { 
                    payload.camera.pitch = absoluteBonePitch; 
                    payload.camera.yaw = absoluteBoneYaw; 
                } else { 
                    payload.aim_pitch = absoluteBonePitch; 
                    payload.aim_yaw = absoluteBoneYaw; 
                }
            }
        } 
        else if (absPitchErr < 3.0 && absYawErr < 6.0) {
            engine.isABSBraking = true;

            if (hasInput && currentMag > 7.0 && dotProduct < -0.6) {
                engine.isABSBraking = false;
                rawX *= 0.8; rawY *= 0.8; 
            } 
            else {
                rawX = 0; rawY = 0;
                let perfectPitch = absoluteBonePitch + (target.pitchError > 0 ? -0.2 : 0.15); 
                let perfectYaw = absoluteBoneYaw;

                if (payload.camera) { 
                    payload.camera.pitch = perfectPitch; 
                    payload.camera.yaw = perfectYaw; 
                } else { 
                    payload.aim_pitch = perfectPitch; 
                    payload.aim_yaw = perfectYaw; 
                }
                
                if (payload.camera_constraints) {
                    payload.camera_constraints.max_pitch_speed = 99999.0;
                    payload.camera_constraints.max_yaw_speed = 99999.0;
                    payload.camera_constraints.friction = 0.0;
                    payload.camera_constraints.damping = 0.0;
                    payload.camera_constraints.recoil_recovery_scale = 0.0;
                }
            }
        } 
        // ====================================================================
        // PHA 2: TRỢ LỰC KÉO (MAGNETIC CUSHION & VECTOR THRUST)
        // ====================================================================
        else if (total2DError < maxCushionLimit && hasInput) {
            engine.isABSBraking = false;
            
            if (dotProduct > 0.0) {
                // Ranh giới phanh thay đổi linh hoạt tùy theo Hipfire xa hay gần
                let brakeBoundary = isLongRangeHipFire ? 5.0 : 3.0;
                let brakeFactor = 1.0 - ((total2DError - brakeBoundary) / (maxCushionLimit - brakeBoundary)); 
                let cushion = 1.0 - (brakeFactor * 0.85); 
                
                engine.thrustMultiplier = baseThrust * cushion; 
                
                let thrustX = engine.thrustMultiplier * X_AXIS_BOOST;
                let thrustY = engine.thrustMultiplier;

                // 4. Y-Axis Compression vs ADS Overdrive
                if (isADS) thrustY = 3.0; // Xé gió khi bật ngắm
                else if (isLongRangeHipFire) thrustY *= 0.45; // Ép xẹp trục dọc 55% khi Hipfire xa
                
                rawX = (blendedRawX * thrustX) + autoPullX;
                rawY = (blendedRawY * thrustY);
            } else {
                rawX *= 0.25; rawY *= 0.25; 
            }
        } 
        else if (hasInput) {
            engine.isABSBraking = false;

            if (dotProduct > 0.5) {
                engine.thrustMultiplier = baseThrust * 0.90; 
            } 
            else if (dotProduct > 0.0) {
                engine.thrustMultiplier = 1.0 + ((baseThrust - 1.0) * (dotProduct / 0.5));
                engine.thrustMultiplier *= 0.90;
            }
            else {
                engine.thrustMultiplier = 0.25; 
            }

            if (dotProduct > 0.0) {
                let thrustX = engine.thrustMultiplier * X_AXIS_BOOST;
                let thrustY = engine.thrustMultiplier;

                // 4. Y-Axis Compression vs ADS Overdrive
                if (isADS) thrustY = 4.5;
                else if (isLongRangeHipFire) thrustY *= 0.45; 
                
                rawX = (blendedRawX * thrustX) + autoPullX;
                rawY = (blendedRawY * thrustY);
            } else {
                rawX *= engine.thrustMultiplier;
                rawY *= engine.thrustMultiplier;
            }
        }

        // ====================================================================
        // BỘ ĐỆM PHẦN DƯ SUB-PIXEL
        // ====================================================================
        let finalX = Math.round(rawX);
        let finalY = Math.round(rawY);
        
        engine.remX = rawX - finalX;
        engine.remY = rawY - finalY;

        payload.touch_delta.x = finalX;
        payload.touch_delta.y = finalY;

        return payload;
    }
}

// ============================================================================
// [NEW] LÕI VŨ KHÍ: MARKSMAN CORE (SÚNG GÕ 1 VIÊN DE, WOODPECKER, SKS)
// ============================================================================
class MarksmanCore {
    static execute(payload) {
        const weaponState = _vortex.__VortexState.weapon;
        const engine = _vortex.__VortexState.engine;

        if (payload.weapon) {
            // [CÔNG NGHỆ]: INVERSE BRAKING (PHANH NGHỊCH ĐẢO CHỐNG VỌT LỐ)
            if (engine.isABSBraking) {
                // Tâm đã khóa vào sọ. Triệt tiêu 100% độ giật nảy lên của dòng Marksman.
                // Điều này giúp DE/Woodpecker không bị nảy vọt qua da đầu ở viên đầu tiên.
                payload.weapon.recoil_y = 0.0;
                payload.weapon.recoil_x = 0.0;
                payload.weapon.recoil_accumulation = 0.0;
                
                // Thu gọn hồng tâm đến mức tối đa để đạn ghim thẳng 1 điểm
                payload.weapon.base_spread = 0.0001;
                payload.weapon.dynamic_spread = 0.0;
                payload.weapon.spread_add_per_shot = 0.0;

                // Phục hồi tâm ngay lập tức sau viên đạn
                if (payload.weapon.recoil_recovery) {
                    payload.weapon.recoil_recovery = 99999.0; 
                }
            } else {
                // Khi ở ngoài Vùng Khóa, giữ nguyên độ nảy tự nhiên để Anti-cheat không phát hiện
                payload.weapon.dynamic_spread *= 0.5; // Chỉ giảm 50% độ tản mát
            }
        }
        return payload;
    }
}

// ============================================================================
// BƯỚC 4: WEAPON SPECIFIC CORES (LÕI VŨ KHÍ & THAO TÚNG ĐƯỜNG ĐẠN)
// Công nghệ: Quantum Choke (SG), Zero-Bloom Loop (SMG), First-Shot Laser (AR), Inverse Braking (Marksman)
// Nhiệm vụ: Xóa sổ vật lý nảy nòng, hội tụ đạn và khóa cứng tia nhìn.
// ============================================================================

class ShotgunCore {
    static execute(payload) {
        const engine = _vortex.__VortexState.engine;
        if (payload.weapon) {
            // Khi tâm đang "dính" vào sọ (ABSBraking), ép chùm đạn thành tia Slug Laser
            if (engine.isABSBraking) {
                payload.weapon.base_spread = 0.0001; 
                payload.weapon.dynamic_spread = 0.0; 
                payload.weapon.max_spread = 0.0001;
                payload.weapon.recoil_y = 0.0;
                payload.weapon.recoil_x = 0.0;
            } else {
                // Giữ lại một ít độ xòe để tăng diện tích trúng mục tiêu khi chưa vào vùng ABS
                payload.weapon.dynamic_spread *= 0.0;
            }
        }
        return payload;
    }
}

class SMGCore {
    static execute(payload) {
        const weaponState = _vortex.__VortexState.weapon;
        const engine = _vortex.__VortexState.engine;
        if (payload.weapon) {
            // Cơ chế sấy: Giảm giật tích tụ (Accumulation) theo chu kỳ đạn
            if (engine.isABSBraking) {
                if (weaponState.bulletCount % 2 === 0) {
                    payload.weapon.recoil_accumulation = 0.0;
                    payload.weapon.dynamic_spread = 0.0;
                } else {
                    payload.weapon.recoil_accumulation *= 0.1;
                    payload.weapon.dynamic_spread *= 0.0;
                }
                payload.weapon.recoil_y = 0.0; 
            }
        }
        return payload;
    }
}

class ARCore {
    static execute(payload) {
        const weaponState = _vortex.__VortexState.weapon;
        const engine = _vortex.__VortexState.engine;
        if (payload.weapon) {
            // Cú hích viên đầu tiên (First-shot Laser)
            if (weaponState.bulletCount <= 1) {
                payload.weapon.recoil_y = 0.0;
                payload.weapon.recoil_x = 0.0;
                payload.weapon.base_spread = 0.0;
            } 
            // Ghìm tâm tuyệt đối khi sấy
            else if (engine.isABSBraking) {
                payload.weapon.recoil_y = 0.0;
                payload.weapon.recoil_x = 0.0;
                payload.weapon.recoil_accumulation = 0.0;
                payload.weapon.recoil_recovery = 99999.0; 
            }
        }
        return payload;
    }
}

class MarksmanCore {
    static execute(payload) {
        const engine = _vortex.__VortexState.engine;
        // [CÔNG NGHỆ MỚI]: PHANH NGHỊCH ĐẢO (INVERSE BRAKING)
        // Dành cho DE, Woodpecker, SKS, AC80, M590
        if (payload.weapon && engine.isABSBraking) {
            // Khi tâm lọt vào vùng ABS, Phanh nghịch đảo sẽ triệt tiêu 100% 
            // lực giật nảy nòng của súng gõ 1 viên.
            payload.weapon.recoil_y = -0.5; // Bơm phản lực ngược để giữ tâm đứng yên
            payload.weapon.recoil_accumulation = 0.0;
            payload.weapon.recoil_recovery = 99999.0;
            payload.weapon.base_spread = 0.0;
        }
        return payload;
    }
}

// ============================================================================
// LỚP BẢO HIỂM: ABSOLUTE RAY-DIR LOCK (ĐỒNG BỘ TIA ĐẠN THỰC THỂ)
// ============================================================================
class BallisticsSynchronizer {
    static execute(payload) {
        const engine = _vortex.__VortexState.engine;
        if (engine.isABSBraking) {
            // Ép mọi tia đạn bay đúng vào mã xương Đầu (Head bone hash)
            if (payload.damage_report || payload.hit_event) {
                let report = payload.damage_report || payload.hit_event;
                report.hit_bone = -2111735698; // BONE_HASH: Đầu
                report.is_headshot = true;
                report.damage_multiplier = 1.35; // Tăng sát thương headshot nhẹ
            }
        }
        return payload;
    }
}

// ============================================================================
// BƯỚC 5: BALLISTICS SYNCHRONIZER (Lớp Bảo Hiểm Tia Đạn V7.0)
// Công nghệ: Smart Bone Hijacking, Magnetic Bullet Bending, Anti-Falloff.
// Nhiệm vụ: Xóa RNG, khóa tia đạn chính xác vào mục tiêu, khuếch đại sát thương.
// ============================================================================
class BallisticsSynchronizer {
    static execute(payload) {
        const state = _vortex.__VortexState;
        const engine = state.engine;
        const target = state.target;
        const weapon = state.weapon;

        // CHỈ can thiệp đường đạn khi Phanh ABS đã đóng băng được tâm súng tại sọ
        // VÀ hệ thống đã xác định được một Target cụ thể
        if (engine.isABSBraking && target.id !== null) {
            
            // ====================================================================
            // 1. ĐỒNG BỘ TIA ĐẠN VẬT LÝ (MAGNETIC BULLET BENDING)
            // ====================================================================
            if (payload.bullet_events) {
                for (let i = 0; i < payload.bullet_events.length; i++) {
                    let bullet = payload.bullet_events[i];
                    
                    // Xóa bỏ tản mát ngẫu nhiên (RNG deviation)
                    bullet.spread_angle = 0.0; 
                    bullet.deviation = 0.0; 
                    bullet.angular_velocity = 0.0;
                    
                    // [CÔNG NGHỆ MỚI]: Đồng bộ vật lý đạn với thuật toán Đón Đầu ở Bước 2
                    if (bullet.trajectory) {
                        bullet.trajectory.gravity_scale = 0.0; // Tắt lực hút trái đất tác động lên viên đạn này
                        bullet.trajectory.drag = 0.0;          // Tắt lực cản gió
                    }

                    // Xuyên thấu ảo: Giúp đạn ghim vào sọ ngay cả khi địch lách nhẹ sau mép tường
                    bullet.is_penetrating = true; 
                    bullet.collision_obstacle = false;
                }
            }

            // ====================================================================
            // 2. MÃ HÓA CỨNG BÁO CÁO SÁT THƯƠNG (SMART BONE HIJACKING)
            // ====================================================================
            if (payload.damage_report || payload.hit_event) {
                // Hỗ trợ mảng (Array) cho các súng bắn ra nhiều tia cùng lúc như Shotgun
                let reports = payload.damage_report ? 
                              (Array.isArray(payload.damage_report) ? payload.damage_report : [payload.damage_report]) : 
                              (Array.isArray(payload.hit_event) ? payload.hit_event : [payload.hit_event]);

                for (let r = 0; r < reports.length; r++) {
                    let report = reports[r];

                    // CHỐT CHẶN AN TOÀN: Chỉ đổi thành Headshot nếu trúng ĐÚNG thằng đang khóa.
                    // Nếu lỡ bắn trúng thằng khác chạy ngang qua, giữ nguyên sát thương gốc để tránh bị Report.
                    if (report.target_id === target.id || report.entity_id === target.id) {
                        
                        // -2111735698 chính là mã BONE_HASH tuyệt đối của xương Đầu (Head)
                        report.hit_bone = -2111735698; 
                        report.is_headshot = true;
                        
                        // Khai tử luật Suy hao sát thương tầm xa (Damage Falloff)
                        report.distance_penalty = 0.0; 

                        // Khuếch đại bạo kích tùy theo phân loại súng
                        if (weapon.type === "MARKSMAN" || weapon.type === "SNIPER" || weapon.type === "SHOTGUN") {
                            report.damage_multiplier = 1.50; // Súng gõ 1 viên cần kết liễu cực gắt
                        } else {
                            report.damage_multiplier = 1.35; // Súng sấy SMG/AR
                        }
                    }
                }
            }
        }
        return payload;
    }
}

// ============================================================================
// BỘ ĐIỀU PHỐI (VORTEX DISPATCHER V7.0) - DÂY CHUYỀN LẮP RÁP (ASSEMBLY LINE)
// ============================================================================
class VortexDispatcher {
    
    processPayload(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        // Quét đệ quy tìm dữ liệu Game
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

        const hasActionableData = payload.players || payload.weapon || payload.camera || payload.touch_delta || payload.input_drag || payload.bullet_events || payload.damage_report;
        if (!hasActionableData) return payload; 

        // --- DÂY CHUYỀN VORTEX V7.0 VẬN HÀNH ---
        
        // Nhịp 1: Đọc tay & Nhận diện súng
        payload = InputInterceptor.execute(payload);
        payload = WeaponAnalyzer.execute(payload);
        
        // Nhịp 1.5: [NEW] Cách ly Động học (Triệt tiêu quán tính bản thân)
        payload = SelfKinematicIsolator.execute(payload);

        // Nhịp 2: Mắt thần quét 2D -> 3D (Đã có bù trừ trọng lực bản thân)
        payload = TargetScanner2D3D.execute(payload); 

        const weaponType = _vortex.__VortexState.weapon.type;
        
        if (weaponType !== "NONE") {
            // Nhịp 3: Động cơ tính lực đẩy Vector 2D và Bám trục X
            payload = VectorThrustEngine.execute(payload);

            // Nhịp 4: Điều hướng Core Vũ khí (Làm chủ độ giật)
            if (weaponType === "SHOTGUN") payload = ShotgunCore.execute(payload);
            else if (weaponType === "SMG") payload = SMGCore.execute(payload);
            else if (weaponType === "AR") payload = ARCore.execute(payload);
            else if (weaponType === "MARKSMAN") payload = MarksmanCore.execute(payload); 

            // Nhịp 5: Đồng bộ tia đạn vật lý
            payload = BallisticsSynchronizer.execute(payload);
        }

        return payload;
    }
}

// ============================================================================
// ENGINE WRAPPER DÀNH CHO IOS SHORTCUTS
// ============================================================================
if (!_vortex.__VORTEX_ENGINE) {
    _vortex.__VORTEX_ENGINE = new VortexDispatcher();
}

function ProcessPayload(inputPayload) {
    try {
        let isString = typeof inputPayload === 'string';
        let payload = isString ? JSON.parse(inputPayload) : inputPayload;
        
        const mutated = _vortex.__VORTEX_ENGINE.processPayload(payload);
        
        return isString ? JSON.stringify(mutated) : mutated;
    } catch (e) {
        return inputPayload;
    }
}

const VORTEX_API = {
    ProcessPayload: ProcessPayload,
    Version: "VORTEX_V7.0_MECHANICAL_ORGANIC"
};

if (typeof window !== 'undefined') window.VORTEX = VORTEX_API;
else if (typeof globalThis !== 'undefined') globalThis.VORTEX = VORTEX_API;
else _vortex.VORTEX = VORTEX_API;

if (typeof module !== 'undefined') module.exports = VORTEX_API;

