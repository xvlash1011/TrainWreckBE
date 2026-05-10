# Railway Deployment Configuration

Liệt kê các biến môi trường (Environment Variables) cần thiết để cấu hình trên Railway:

```text
PORT=3001
FRONTEND_URL=https://your-frontend-domain.com
DATABASE_URL=your_database_connection_string_if_needed
```

## Các lệnh quan trọng:
- **Build Command:** `npm run build`
- **Start Command:** `npm run start`

## Ghi chú:
- Railway sẽ tự động cung cấp biến `PORT`, bạn có thể không cần điền thủ công trừ khi muốn override.
- `FRONTEND_URL` dùng để cấu hình CORS, hãy điền domain của ứng dụng Frontend của bạn.
- Đảm bảo các file dữ liệu (`.json`, `.geojson`) đã được generate và có mặt trong project.
