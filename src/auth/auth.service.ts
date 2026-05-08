import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { config } from '../common/config';
import { UserRole } from '../common/constants';
import { UserModel, IUser } from './user.model';

export class AuthService {
  async register(email: string, password: string): Promise<{ access_token: string }> {
    const existing = await UserModel.findOne({ email });
    if (existing) throw Object.assign(new Error('Email already registered'), { status: 409 });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await UserModel.create({ email, passwordHash, role: UserRole.USER });
    return { access_token: await this.freshToken(user) };
  }

  async registerAdmin(email: string, password: string, adminSecret: string): Promise<{ access_token: string }> {
    if (adminSecret !== config.adminSecret) {
      throw Object.assign(new Error('Invalid admin secret'), { status: 403 });
    }
    const existing = await UserModel.findOne({ email });
    if (existing) throw Object.assign(new Error('Email already registered'), { status: 409 });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await UserModel.create({ email, passwordHash, role: UserRole.ADMIN });
    return { access_token: await this.freshToken(user) };
  }

  async login(email: string, password: string): Promise<{ access_token: string }> {
    const user = await UserModel.findOne({ email });
    if (!user) throw Object.assign(new Error('Invalid credentials'), { status: 401 });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw Object.assign(new Error('Invalid credentials'), { status: 401 });

    return { access_token: await this.freshToken(user) };
  }

  private async freshToken(user: IUser): Promise<string> {
    const updated = await UserModel.findByIdAndUpdate(
      user._id,
      { $inc: { tokenVersion: 1 } },
      { new: true },
    );
    return jwt.sign(
      { sub: user._id.toString(), email: user.email, role: user.role, tv: updated!.tokenVersion },
      config.jwtSecret,
      { expiresIn: '7d' },
    );
  }
}
