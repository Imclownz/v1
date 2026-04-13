/**
 * ENTERPRISE-GRADE: CONFIG MUTATOR SYSTEM v37.0
 * Architecture: Recursive JSON Traverser, Global Gene Mutation
 * Status: Maximum Performance. Safety Protocols: BYPASSED.
 * Directives: Zero-Recoil, Anti-Chest Lock, Absolute Head Priority.
 */

// ==========================================
// 1. ECOSYSTEM: LOGGER & VALIDATOR
// ==========================================
class PerformanceLogger {
    static log(action, latency, mutations) {
        // Chỉ log khi có độ trễ lớn để giữ sạch console, nhưng hiển thị số lượng "đột biến"
        if (latency > 50) {
            console.warn(`[WARN] T-Spike: ${latency}ms | Action: ${action} | Mutations: ${mutations}`);
        } else {
            console.log(`[SUCCESS] ${action} completed | Latency: ${latency}ms | Mutations injected: ${mutations}`);
        }
    }
}

// ==========================================
// 2. CORE LOGIC: RECURSIVE GENE MUTATOR
// ==========================================
class ConfigMutator {
    constructor() {
        this.config = {
            voidWeight: -99999.0,   // Đánh sập lực hút
            maxWeight: 99999.0,     // Lực kéo cực đại
            headMultiplier: 5.0,    // Phóng to bán kính nhận diện đầu
            goldenRatioOffset: 0.66 // Giới hạn bù Y
        };
        this.mutationCount = 0;
    }

    /**
     * Thuật toán Đệ quy: Quét sâu vào từng lớp của file JSON.
     * Tự động tìm kiếm và ghi đè bất kể cấu trúc dữ liệu bị nhà phát hành thay đổi hay xáo trộn.
     */
    traverseAndMutate(obj) {
        if (typeof obj !== 'object' || obj === null) return obj;

        for (let key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                let value = obj[key];
                let lowerKey = key.toLowerCase();

                // Nếu là Object lồng nhau, tiếp tục đệ quy đi xuống
                if (typeof value === 'object' && value !== null) {
                    obj[key] = this.traverseAndMutate(value);
                } 
                // Nếu là giá trị số (thông số vật lý, từ tính)
                else if (typeof value === 'number') {
                    
                    // Lệnh 1: Triệt tiêu mọi độ giật, rung, lan tỏa và gia tốc
                    if (lowerKey.includes('recoil') || lowerKey.includes('shake') || lowerKey.includes('spread') || lowerKey.includes('drop') || lowerKey.includes('accel')) {
                        obj[key] = 0.0;
                        this.mutationCount++;
                    }
                    
                    // Lệnh 2: Phá bỏ lực hút thân (Anti-Chest Lock)
                    else if (lowerKey.includes('chest') || lowerKey.includes('spine') || lowerKey.includes('pelvis') || lowerKey.includes('hips')) {
                        if (lowerKey.includes('weight') || lowerKey.includes('magnet') || lowerKey.includes('snap') || lowerKey.includes('force')) {
                            obj[key] = this.config.voidWeight;
                            this.mutationCount++;
                        }
                        // Thu nhỏ hitbox thân
                        else if (lowerKey.includes('radius') || lowerKey.includes('size')) {
                            obj[key] = 0.01;
                            this.mutationCount++;
                        }
                    }
                    
                    // Lệnh 3: Ưu tiên vùng Đầu tuyệt đối
                    else if (lowerKey.includes('head') || lowerKey.includes('neck')) {
                        if (lowerKey.includes('weight') || lowerKey.includes('magnet') || lowerKey.includes('snap') || lowerKey.includes('force')) {
                            obj[key] = this.config.maxWeight;
                            this.mutationCount++;
                        }
                        // Cường hóa bán kính nhận diện đầu
                        else if (lowerKey.includes('radius') || lowerKey.includes('size')) {
                            obj[key] = value * this.config.headMultiplier;
                            this.mutationCount++;
                        }
                    }

                    // Lệnh 4: Tiêm Golden Ratio Y-Offset nếu có trường center_of_mass hoặc offset
                    else if ((lowerKey.includes('head') || lowerKey.includes('aim')) && lowerKey.includes('y_offset')) {
                        obj[key] = this.config.goldenRatioOffset;
                        this.mutationCount++;
                    }
                } 
                // Nếu là chuỗi (String) quy định mức độ ưu tiên
                else if (typeof value === 'string') {
                    if ((lowerKey.includes('head') || lowerKey.includes('neck')) && lowerKey.includes('priority')) {
                        obj[key] = "MAXIMUM";
                        this.mutationCount++;
                    }
                    else if ((lowerKey.includes('chest') || lowerKey.includes('spine') || lowerKey.includes('pelvis')) && lowerKey.includes('priority')) {
                        obj[key] = "IGNORE";
                        this.mutationCount++;
                    }
                    // Đảm bảo không làm mượt (Interpolation = ZERO)
                    else if (lowerKey.includes('interpolation') || lowerKey.includes('smoothing')) {
                        obj[key] = "ZERO";
                        this.mutationCount++;
                    }
                }
            }
        }
        return obj;
    }

    processPayload(bodyString) {
        const startTime = Date.now();
        this.mutationCount = 0; // Reset counter cho mỗi packet

        try {
            // Khởi tạo cây JSON
            const payload = JSON.parse(bodyString);
            
            // Kích hoạt phản ứng dây chuyền đột biến
            const mutatedPayload = this.traverseAndMutate(payload);
            
            const latency = Date.now() - startTime;
            PerformanceLogger.log('Global Config Mutated', latency, this.mutationCount);
            
            // Trả về bộ gen mới
            return JSON.stringify(mutatedPayload);
        } catch (e) {
            console.warn("[ERROR] JSON Parse failed. Fallback to original packet to prevent crash.");
            return bodyString; 
        }
    }
}

// ==========================================
// 3. BỘ ĐIỀU PHỐI ENTRY POINT (SHADOWROCKET)
// ==========================================
const EngineInstance = new ConfigMutator();

// Giao thức thực thi của Shadowrocket
if (typeof $response !== "undefined" && $response.body) {
    // Chỉ xử lý nếu có body để tránh lỗi undefined
    $done({ body: EngineInstance.processPayload($response.body) });
}
